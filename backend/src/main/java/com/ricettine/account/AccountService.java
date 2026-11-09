package com.ricettine.account;

import com.ricettine.account.AccountDtos.NewAccountRequest;
import com.ricettine.account.AccountDtos.ProfilePatch;
import com.ricettine.auth.AuthSessions;
import com.ricettine.common.AfterTransaction;
import com.ricettine.common.ApiException;
import com.ricettine.common.TokenPurpose;
import com.ricettine.common.OneTimeTokenRepository;
import com.ricettine.media.ImageVariant;
import com.ricettine.media.MediaKind;
import com.ricettine.media.MediaService;
import com.ricettine.media.ProcessedUpload;
import java.util.List;
import java.util.Set;
import java.util.UUID;
import java.util.function.Supplier;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionTemplate;

@Service
public class AccountService {

	private final UserRepository users;
	private final PasswordEncoder encoder;
	private final MediaService media;
	private final AuthSessions sessions;
	private final JdbcTemplate jdbc;
	private final List<AccountDeletionHook> deletionHooks;
	private final AfterTransaction after;
	private final OneTimeTokenRepository tokens;
	private final TransactionTemplate tx;

	public AccountService(UserRepository users, PasswordEncoder encoder, MediaService media, AuthSessions sessions,
			JdbcTemplate jdbc, List<AccountDeletionHook> deletionHooks, AfterTransaction after,
			OneTimeTokenRepository tokens, PlatformTransactionManager txManager) {
		this.tx = new TransactionTemplate(txManager);
		this.after = after;
		this.tokens = tokens;
		this.users = users;
		this.encoder = encoder;
		this.media = media;
		this.sessions = sessions;
		this.jdbc = jdbc;
		this.deletionHooks = deletionHooks;
	}

	@Transactional
	public User create(NewAccountRequest req, boolean admin) {
		String email = Identity.normalizeEmail(req.email());
		String username = Identity.validateUsername(req.username());
		String password = validPassword(req.password());
		String displayName = validDisplayName(req.displayName());
		return saveUnique(new User(email, username, displayName, encoder.encode(password), admin));
	}

	@Transactional
	public User updateProfile(UUID userId, ProfilePatch patch) {
		User user = users.findById(userId).orElseThrow(AccountService::notAuthenticated);
		if (patch.displayName() != null) {
			user.setDisplayName(validDisplayName(patch.displayName()));
		}
		if (patch.username() != null) {
			user.setUsername(Identity.validateUsername(patch.username()));
		}
		return saveUnique(user);
	}

	/** Verifies the password of an already-authenticated user; 400 {@code bad_credentials} on mismatch. */
	public void requirePassword(User user, String password) {
		if (password == null || !encoder.matches(password, user.getPasswordHash())) {
			throw new ApiException(HttpStatus.BAD_REQUEST, "bad_credentials");
		}
	}

	/**
	 * Changes the password; outstanding reset links are revoked and every session of the user except
	 * {@code keepSessionId} is ended after commit.
	 */
	@Transactional
	public void changePassword(UUID userId, String currentPassword, String newPassword, String keepSessionId) {
		User user = users.findById(userId).orElseThrow(AccountService::notAuthenticated);
		requirePassword(user, currentPassword);
		user.setPasswordHash(encoder.encode(validPassword(newPassword)));
		users.saveAndFlush(user);
		revokeResetLinks(userId);
		after.afterCommit("invalidate other sessions of " + userId,
				() -> sessions.invalidateOtherSessions(userId, keepSessionId));
	}

	/**
	 * Sets a new password without knowing the old one (reset link): the user's other outstanding reset links are
	 * revoked (the redeemed one is already marked used) and all the user's sessions end after commit.
	 */
	@Transactional
	public void resetPassword(UUID userId, String newPassword) {
		User user = users.findById(userId).orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "reset_invalid"));
		user.setPasswordHash(encoder.encode(validPassword(newPassword)));
		users.saveAndFlush(user);
		revokeResetLinks(userId);
		after.afterCommit("invalidate sessions of " + userId, () -> sessions.invalidateAllSessions(userId));
	}

	private void revokeResetLinks(UUID userId) {
		tokens.revokeOutstanding(userId, TokenPurpose.PASSWORD_RESET.name());
	}

	/**
	 * Grants or removes the admin role. Removing it from the last admin is 409 {@code last_admin}. Sessions
	 * snapshot authorities, so on a change every session of the target ends after commit (they sign in again).
	 */
	@Transactional
	public User setAdmin(UUID userId, boolean admin) {
		List<User> admins = users.lockAdmins(); // serialises concurrent role changes and admin deletions
		User user = users.findById(userId).orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "not_found"));
		if (user.isAdmin() == admin) {
			return user;
		}
		if (!admin && admins.stream().noneMatch(a -> !a.getId().equals(userId))) {
			throw new ApiException(HttpStatus.CONFLICT, "last_admin");
		}
		user.setAdmin(admin);
		users.saveAndFlush(user);
		after.afterCommit("invalidate sessions of " + userId, () -> sessions.invalidateAllSessions(userId));
		return user;
	}

	/**
	 * Processes the image first, outside any transaction (the limiter wait and the decode must not hold a DB
	 * connection), then registers it and swaps it in within one short transaction; the old blobs go only once the
	 * swap has committed, the new ones are removed if it rolls back.
	 */
	public User setAvatar(UUID userId, Supplier<byte[]> image) {
		ProcessedUpload upload = media.process(image, Set.of(ImageVariant.AVATAR));
		return tx.execute(status -> swapAvatar(userId, upload));
	}

	private User swapAvatar(UUID userId, ProcessedUpload upload) {
		User user = users.findById(userId).orElseThrow(AccountService::notAuthenticated);
		String newKey = media.register(upload, userId, MediaKind.AVATAR, null);
		String oldKey = user.getAvatarKey();
		user.setAvatarKey(newKey);
		users.saveAndFlush(user);
		if (oldKey != null) {
			media.delete(oldKey);
		}
		return user;
	}

	@Transactional
	public User removeAvatar(UUID userId) {
		User user = users.findById(userId).orElseThrow(AccountService::notAuthenticated);
		String oldKey = user.getAvatarKey();
		if (oldKey != null) {
			user.setAvatarKey(null);
			users.saveAndFlush(user);
			media.delete(oldKey);
		}
		return user;
	}

	/**
	 * Deletes the account: hooks run first, then all the user's media rows, then the user row (FK cascades remove
	 * tokens); media blobs and the user's sessions go after commit. The last admin cannot leave while other users remain.
	 */
	@Transactional
	public void delete(UUID userId) {
		User user = users.findById(userId).orElseThrow(AccountService::notAuthenticated);
		if (user.isAdmin()) {
			boolean otherAdmin = users.lockAdmins().stream().anyMatch(a -> !a.getId().equals(userId));
			if (!otherAdmin && users.count() > 1) {
				throw new ApiException(HttpStatus.CONFLICT, "last_admin");
			}
		}
		deletionHooks.forEach(h -> h.beforeDelete(userId));
		media.deleteAllOwnedBy(userId); // every kind: rows now, blobs after commit
		users.delete(user);
		users.flush();
		if (users.count() == 0) {
			jdbc.update("delete from instance_setup");
		}
		after.afterCommit("invalidate sessions of " + userId, () -> sessions.invalidateAllSessions(userId));
	}

	private User saveUnique(User user) {
		try {
			return users.saveAndFlush(user);
		}
		catch (DataIntegrityViolationException e) {
			String text = rootText(e);
			if (text.contains("uq_app_user_email")) {
				throw new ApiException(HttpStatus.CONFLICT, "email_taken");
			}
			if (text.contains("uq_app_user_username")) {
				throw new ApiException(HttpStatus.CONFLICT, "username_taken");
			}
			throw e;
		}
	}

	private static String validPassword(String password) {
		if (password == null || password.length() < 10) {
			throw new ApiException(HttpStatus.BAD_REQUEST, "password_too_short");
		}
		if (password.length() > 128) {
			throw new ApiException(HttpStatus.BAD_REQUEST, "password_too_long");
		}
		return password;
	}

	private static String validDisplayName(String raw) {
		String displayName = raw == null ? "" : raw.trim();
		if (displayName.isEmpty() || displayName.length() > 80) {
			throw new ApiException(HttpStatus.BAD_REQUEST, "validation_failed");
		}
		return displayName;
	}

	private static ApiException notAuthenticated() {
		return new ApiException(HttpStatus.UNAUTHORIZED, "not_authenticated");
	}

	private static String rootText(Throwable t) {
		StringBuilder sb = new StringBuilder();
		for (; t != null; t = t.getCause()) {
			sb.append(t.getMessage()).append('\n');
		}
		return sb.toString();
	}
}

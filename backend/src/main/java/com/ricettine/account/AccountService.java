package com.ricettine.account;

import com.ricettine.account.AccountDtos.NewAccountRequest;
import com.ricettine.account.AccountDtos.ProfilePatch;
import com.ricettine.auth.AuthSessions;
import com.ricettine.common.AfterTransaction;
import com.ricettine.common.ApiException;
import com.ricettine.common.TokenPurpose;
import com.ricettine.invite.OneTimeTokenRepository;
import com.ricettine.media.ImageVariant;
import com.ricettine.media.MediaService;
import java.util.List;
import java.util.Set;
import java.util.UUID;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

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

	public AccountService(UserRepository users, PasswordEncoder encoder, MediaService media, AuthSessions sessions,
			JdbcTemplate jdbc, List<AccountDeletionHook> deletionHooks, AfterTransaction after,
			OneTimeTokenRepository tokens) {
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

	/** Stores the new avatar first, swaps it in, and removes the old blob only once the swap has committed. */
	@Transactional
	public User setAvatar(UUID userId, byte[] image) {
		User user = users.findById(userId).orElseThrow(AccountService::notAuthenticated);
		String newKey = media.store(image, Set.of(ImageVariant.AVATAR));
		after.afterRollback("delete orphaned media " + newKey, () -> media.delete(newKey));
		String oldKey = user.getAvatarKey();
		user.setAvatarKey(newKey);
		users.saveAndFlush(user);
		if (oldKey != null) {
			after.afterCommit("delete media " + oldKey, () -> media.delete(oldKey));
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
			after.afterCommit("delete media " + oldKey, () -> media.delete(oldKey));
		}
		return user;
	}

	/**
	 * Deletes the account: hooks run first, then the row (FK cascades remove tokens); the avatar blob and the
	 * user's sessions go after commit. The last admin cannot leave while other users remain.
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
		String avatarKey = user.getAvatarKey();
		users.delete(user);
		users.flush();
		if (users.count() == 0) {
			jdbc.update("delete from instance_setup");
		}
		// Independent best-effort steps: a failed blob delete must never stop session invalidation.
		if (avatarKey != null) {
			after.afterCommit("delete media " + avatarKey, () -> media.delete(avatarKey));
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

package com.ricettine.auth;

import com.ricettine.account.AccountService;
import com.ricettine.account.UserRepository;
import com.ricettine.common.ApiException;
import com.ricettine.common.OneTimeTokens;
import com.ricettine.common.TokenPurpose;
import com.ricettine.common.Tokens;
import com.ricettine.invite.OneTimeToken;
import com.ricettine.invite.OneTimeTokenRepository;
import java.time.Duration;
import java.time.Instant;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class PasswordResetService {

	static final Duration TTL = Duration.ofHours(24);

	public record Created(String token, Instant expiresAt) {
	}

	private final OneTimeTokenRepository tokens;
	private final OneTimeTokens oneTimeTokens;
	private final UserRepository users;
	private final AccountService accounts;

	public PasswordResetService(OneTimeTokenRepository tokens, OneTimeTokens oneTimeTokens, UserRepository users,
			AccountService accounts) {
		this.tokens = tokens;
		this.oneTimeTokens = oneTimeTokens;
		this.users = users;
		this.accounts = accounts;
	}

	@Transactional
	public Created create(UUID adminId, UUID userId) {
		if (!users.existsById(userId)) {
			throw new ApiException(HttpStatus.NOT_FOUND, "not_found");
		}
		// Only the newest link works: issuing one revokes the user's earlier, still-outstanding links.
		tokens.revokeOutstanding(userId, TokenPurpose.PASSWORD_RESET.name());
		String token = Tokens.newToken();
		OneTimeToken t = tokens.save(new OneTimeToken(TokenPurpose.PASSWORD_RESET.name(), Tokens.hash(token),
				userId, adminId, Instant.now().plus(TTL)));
		return new Created(token, t.getExpiresAt());
	}

	/** Claim and password change share one transaction: a rejected password leaves the link usable. */
	@Transactional
	public void redeem(String token, String newPassword) {
		var claimed = oneTimeTokens.claim(token, TokenPurpose.PASSWORD_RESET)
			.orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "reset_invalid"));
		accounts.resetPassword(claimed.userId(), newPassword);
	}
}

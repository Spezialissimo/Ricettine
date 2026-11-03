package com.ricettine.invite;

import com.ricettine.account.AccountDtos.NewAccountRequest;
import com.ricettine.account.AccountService;
import com.ricettine.account.User;
import com.ricettine.common.ApiException;
import com.ricettine.common.OneTimeToken;
import com.ricettine.common.OneTimeTokenRepository;
import com.ricettine.common.OneTimeTokens;
import com.ricettine.common.TokenPurpose;
import com.ricettine.common.Tokens;
import java.time.Duration;
import java.time.Instant;
import java.util.List;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class InviteService {

	static final Duration TTL = Duration.ofDays(7);
	private static final String PURPOSE = TokenPurpose.INSTANCE_INVITE.name();

	public record Created(UUID id, String token, Instant expiresAt) {
	}

	private final OneTimeTokenRepository tokens;
	private final AccountService accounts;
	private final OneTimeTokens oneTimeTokens;

	public InviteService(OneTimeTokenRepository tokens, AccountService accounts,
			OneTimeTokens oneTimeTokens) {
		this.tokens = tokens;
		this.accounts = accounts;
		this.oneTimeTokens = oneTimeTokens;
	}

	@Transactional
	public Created create(UUID adminId) {
		String token = Tokens.newToken();
		OneTimeToken t = tokens.save(
				new OneTimeToken(PURPOSE, Tokens.hash(token), null, adminId, Instant.now().plus(TTL)));
		return new Created(t.getId(), token, t.getExpiresAt());
	}

	@Transactional(readOnly = true)
	public List<OneTimeToken> listActive() {
		return tokens.listActive(PURPOSE);
	}

	@Transactional
	public void revoke(UUID id) {
		if (tokens.revoke(id, PURPOSE) == 0) {
			throw new ApiException(HttpStatus.NOT_FOUND, "not_found");
		}
	}

	/** Expiry of a still-valid invite; does not consume it. */
	@Transactional(readOnly = true)
	public Instant peek(String token) {
		return tokens.findActive(Tokens.hash(token), PURPOSE).map(OneTimeToken::getExpiresAt)
			.orElseThrow(InviteService::invalid);
	}

	/**
	 * Claims the invite and creates the account in one transaction: if account creation fails the claim is
	 * rolled back and the invite stays usable.
	 */
	@Transactional
	public User register(String token, NewAccountRequest req) {
		if (oneTimeTokens.claim(token, TokenPurpose.INSTANCE_INVITE).isEmpty()) {
			throw invalid();
		}
		return accounts.create(req, false);
	}

	private static ApiException invalid() {
		return new ApiException(HttpStatus.NOT_FOUND, "invite_invalid");
	}
}

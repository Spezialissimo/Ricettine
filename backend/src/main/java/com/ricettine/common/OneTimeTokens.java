package com.ricettine.common;

import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

/** Atomic single-use claim of a one-time token (invite, password reset). */
@Component
public class OneTimeTokens {

	public record ClaimedToken(UUID id, UUID userId) {
	}

	private final JdbcTemplate jdbc;

	public OneTimeTokens(JdbcTemplate jdbc) {
		this.jdbc = jdbc;
	}

	/**
	 * Marks the token used if it is active (unused, unrevoked, unexpired) for the purpose. Joins the caller's
	 * transaction, so a later failure rolls the claim back and the token stays usable.
	 */
	public Optional<ClaimedToken> claim(String token, TokenPurpose purpose) {
		List<ClaimedToken> rows = jdbc.query(
				"update one_time_token set used_at = now() where token_hash = ? and purpose = ? "
						+ "and used_at is null and revoked_at is null and expires_at > now() returning id, user_id",
				(rs, i) -> new ClaimedToken(rs.getObject("id", UUID.class), rs.getObject("user_id", UUID.class)),
				Tokens.hash(token), purpose.name());
		return rows.stream().findFirst();
	}
}

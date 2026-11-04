package com.ricettine.cookbook;

import com.ricettine.account.AccountDeletionHook;
import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

/**
 * Locks the leaving user's cookbooks before the user row goes. Every cookbook write path locks the cookbook row
 * first and touches its invite token afterwards; the user delete cascades to the tokens and to the cookbooks in an
 * unspecified order, so without this a concurrent invite accept could deadlock with it. Deletes nothing itself:
 * the FK cascades and {@code MediaService.deleteAllOwnedBy} do the removal.
 */
@Component
class CookbookAccountDeletionHook implements AccountDeletionHook {

	private final JdbcTemplate jdbc;

	CookbookAccountDeletionHook(JdbcTemplate jdbc) {
		this.jdbc = jdbc;
	}

	@Override
	public void beforeDelete(UUID userId) {
		jdbc.queryForList("select id from cookbook where owner_id = ? order by id for update", userId);
	}
}

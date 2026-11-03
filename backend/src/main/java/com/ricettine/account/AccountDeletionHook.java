package com.ricettine.account;

import java.util.UUID;

/**
 * Implemented by features that own data referencing a user; called inside the deletion transaction.
 * Hooks must never delete blobs directly (a rollback would lose them): defer such deletions with
 * {@link com.ricettine.common.AfterTransaction#afterCommit}.
 */
public interface AccountDeletionHook {

	void beforeDelete(UUID userId);
}

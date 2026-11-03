package com.ricettine.account;

import java.util.UUID;

/**
 * Implemented by features that own data referencing a user; called inside the deletion transaction, before the
 * user's media is removed. Media (rows of every kind and their blobs) is handled centrally by
 * {@link com.ricettine.media.MediaService#deleteAllOwnedBy}, so hooks need not delete media. Any other blob a hook
 * owns must never be deleted directly (a rollback would lose it): defer it with
 * {@link com.ricettine.common.AfterTransaction#afterCommit}.
 */
public interface AccountDeletionHook {

	void beforeDelete(UUID userId);
}

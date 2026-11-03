package com.ricettine.account;

import java.util.UUID;

/** Implemented by features that own data referencing a user; called inside the deletion transaction. */
public interface AccountDeletionHook {

	void beforeDelete(UUID userId);
}

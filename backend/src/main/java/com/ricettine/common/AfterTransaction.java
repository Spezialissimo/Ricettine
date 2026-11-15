package com.ricettine.common;

import com.ricettine.site.Site;
import com.ricettine.site.SiteContext;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;

/**
 * Best-effort actions tied to a transaction outcome. A failing action is logged at WARN and never propagates, so
 * a committed change cannot turn into an error response and later actions still run.
 */
@Component
public class AfterTransaction {

	private static final Logger log = LoggerFactory.getLogger(AfterTransaction.class);

	/** Runs after commit; runs immediately when no transaction is active. */
	public void afterCommit(String what, Runnable action) {
		Site site = SiteContext.current();
		if (!TransactionSynchronizationManager.isSynchronizationActive()) {
			run(what, SiteContext.current(), action);
			return;
		}
		TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
			@Override
			public void afterCommit() {
				run(what, site, action);
			}
		});
	}

	/** Runs only if the transaction rolled back; does nothing when no transaction is active. */
	public void afterRollback(String what, Runnable action) {
		Site site = SiteContext.current();
		if (!TransactionSynchronizationManager.isSynchronizationActive()) {
			return;
		}
		TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
			@Override
			public void afterCompletion(int status) {
				if (status == STATUS_ROLLED_BACK) {
					run(what, site, action);
				}
			}
		});
	}

	/** Runs on the site that scheduled the action, whichever thread the transaction completes on. */
	private static void run(String what, Site site, Runnable action) {
		try {
			SiteContext.runAs(site, action);
		}
		catch (RuntimeException e) {
			log.warn("Post-transaction cleanup failed: {}", what, e);
		}
	}
}

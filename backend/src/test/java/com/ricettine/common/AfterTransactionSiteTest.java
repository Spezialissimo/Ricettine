package com.ricettine.common;

import static org.assertj.core.api.Assertions.assertThat;

import com.ricettine.site.Site;
import com.ricettine.site.SiteContext;
import java.util.concurrent.atomic.AtomicReference;
import org.junit.jupiter.api.Test;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;

class AfterTransactionSiteTest {

	@Test
	void actionRunsOnTheSiteThatScheduledIt() {
		AtomicReference<Site> seen = new AtomicReference<>();
		TransactionSynchronizationManager.initSynchronization();
		try {
			SiteContext.runAs(Site.DEMO, () -> new AfterTransaction().afterCommit("x", () -> seen.set(SiteContext.current())));
			// completes later, on a thread/context that is on MAIN
			TransactionSynchronizationManager.getSynchronizations().forEach(TransactionSynchronization::afterCommit);
		}
		finally {
			TransactionSynchronizationManager.clearSynchronization();
		}
		assertThat(seen.get()).isEqualTo(Site.DEMO);
	}
}

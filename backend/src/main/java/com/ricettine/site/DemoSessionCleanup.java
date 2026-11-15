package com.ricettine.site;

import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.session.jdbc.JdbcIndexedSessionRepository;
import org.springframework.stereotype.Component;

/**
 * Spring Session's own cleanup runs on a scheduler thread with no site, so it only reaches the main database. This
 * runs the same cleanup against the demo database, on the same cadence.
 */
@Component
@ConditionalOnProperty(name = "ricettine.demo.enabled", havingValue = "true")
public class DemoSessionCleanup {

	private final JdbcIndexedSessionRepository sessions;

	public DemoSessionCleanup(JdbcIndexedSessionRepository sessions) {
		this.sessions = sessions;
	}

	@Scheduled(cron = "${spring.session.jdbc.cleanup-cron:0 * * * * *}")
	public void run() {
		SiteContext.runAs(Site.DEMO, sessions::cleanUpExpiredSessions);
	}
}

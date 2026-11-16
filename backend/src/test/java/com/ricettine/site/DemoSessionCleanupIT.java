package com.ricettine.site;

import static org.assertj.core.api.Assertions.assertThat;

import com.ricettine.DemoIntegrationTest;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;

class DemoSessionCleanupIT extends DemoIntegrationTest {

	@Autowired
	private DemoSessionCleanup cleanup;

	private void insertExpired(String id) {
		jdbc.update("insert into spring_session (primary_id, session_id, creation_time, last_access_time, "
				+ "max_inactive_interval, expiry_time) values (?, ?, 1, 1, 1, 2)", id, id);
	}

	private int count() {
		return jdbc.queryForObject("select count(*) from spring_session", Integer.class);
	}

	@Test
	void removesExpiredDemoSessionsAndLeavesMainAlone() {
		String mainId = "11111111-1111-1111-1111-111111111111";
		String demoId = "22222222-2222-2222-2222-222222222222";
		insertExpired(mainId);
		SiteContext.runAs(Site.DEMO, () -> insertExpired(demoId));

		cleanup.run();

		assertThat(SiteContext.callAs(Site.DEMO, this::count)).isZero();
		assertThat(count()).isEqualTo(1);
	}
}

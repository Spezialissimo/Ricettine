package com.ricettine;

import com.ricettine.account.AccountService;
import com.ricettine.testsupport.TestData;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.testcontainers.service.connection.ServiceConnection;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.security.test.web.support.WebTestUtils;
import org.springframework.security.web.csrf.CookieCsrfTokenRepository;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.web.context.WebApplicationContext;
import org.testcontainers.postgresql.PostgreSQLContainer;
import tools.jackson.databind.ObjectMapper;

/**
 * Base class for all backend integration tests. One Postgres container is started once per JVM
 * (singleton pattern) and shared by every test class, so the Spring context cache stays valid.
 */
@SpringBootTest(properties = { "ricettine.storage.local.path=target/test-media" })
// Every MockMvc request comes from 127.0.0.1 and the suites register far more than 30 users, so the per-IP limits are
// effectively off here; the account, upload and profile limits keep their defaults. IpRateLimitIT sets them back.
@TestPropertySource(properties = { "ricettine.limits.login-ip.limit=100000",
		"ricettine.limits.anonymous-auth.limit=100000" })
@Import(TestClockConfig.class)
@AutoConfigureMockMvc
public abstract class IntegrationTest {

	@ServiceConnection
	protected static final PostgreSQLContainer postgres = new PostgreSQLContainer("postgres:17-alpine");

	static {
		postgres.start();
	}

	@Autowired
	protected MockMvc mvc;

	@Autowired
	protected JdbcTemplate jdbc;

	@Autowired
	protected AccountService accounts;

	@Autowired
	protected ObjectMapper json;

	@Autowired
	private WebApplicationContext wac;

	/** Builders for users, recipes, cookbooks and photos; see {@link TestData}. */
	protected TestData data;

	/** Every test starts from an empty database: users (and with them everything they own) and all sessions. */
	@BeforeEach
	void resetDatabase() {
		jdbc.execute("truncate table app_user, one_time_token, instance_setup cascade");
		jdbc.execute("delete from spring_session");
		data = new TestData(mvc, json, jdbc, accounts);
	}

	/**
	 * csrf() from MockMvc swaps the CSRF token repository of the CsrfFilter in the cached, shared context for a
	 * session-backed one. Put the production cookie repository back so no test depends on the order of its neighbours.
	 */
	@AfterEach
	protected void restoreCsrfRepository() {
		WebTestUtils.setCsrfTokenRepository(new MockHttpServletRequest(wac.getServletContext()),
				CookieCsrfTokenRepository.withHttpOnlyFalse());
	}
}

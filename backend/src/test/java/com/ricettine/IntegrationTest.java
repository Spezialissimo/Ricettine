package com.ricettine;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.testcontainers.service.connection.ServiceConnection;
import org.springframework.context.annotation.Import;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.web.servlet.MockMvc;
import org.testcontainers.postgresql.PostgreSQLContainer;

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
}

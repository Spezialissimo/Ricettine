package com.ricettine;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.testcontainers.service.connection.ServiceConnection;
import org.springframework.test.web.servlet.MockMvc;
import org.testcontainers.postgresql.PostgreSQLContainer;

/**
 * Base class for all backend integration tests. One Postgres container is started once per JVM
 * (singleton pattern) and shared by every test class, so the Spring context cache stays valid.
 */
@SpringBootTest(properties = { "ricettine.storage.local.path=target/test-media" })
@AutoConfigureMockMvc
public abstract class IntegrationTest {

	@ServiceConnection
	static final PostgreSQLContainer postgres = new PostgreSQLContainer("postgres:17-alpine");

	static {
		postgres.start();
	}

	@Autowired
	protected MockMvc mvc;
}

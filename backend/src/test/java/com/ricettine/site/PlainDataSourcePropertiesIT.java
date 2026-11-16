package com.ricettine.site;

import static org.assertj.core.api.Assertions.assertThat;

import javax.sql.DataSource;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.jdbc.autoconfigure.JdbcConnectionDetails;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.ApplicationContext;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.TestPropertySource;
import org.testcontainers.postgresql.PostgreSQLContainer;

/**
 * Production wiring: spring.datasource.* only, no service connection (so no JdbcConnectionDetails bean). Does not
 * extend IntegrationTest, has its own container.
 */
@SpringBootTest(properties = { "ricettine.storage.local.path=target/test-media" })
@TestPropertySource(properties = "ricettine.demo.enabled=true")
class PlainDataSourcePropertiesIT {

	private static final PostgreSQLContainer postgres = new PostgreSQLContainer("postgres:17-alpine");

	static {
		postgres.start();
	}

	@DynamicPropertySource
	static void datasource(DynamicPropertyRegistry registry) {
		registry.add("spring.datasource.url", postgres::getJdbcUrl);
		registry.add("spring.datasource.username", postgres::getUsername);
		registry.add("spring.datasource.password", postgres::getPassword);
	}

	@Autowired
	private DataSource dataSource;

	@Autowired
	private ApplicationContext context;

	@Test
	void contextStartsAndBothSitesQuery() {
		assertThat(context.getBeanProvider(JdbcConnectionDetails.class).getIfAvailable()).isNull();
		JdbcTemplate jdbc = new JdbcTemplate(dataSource);
		assertThat(jdbc.queryForObject("select count(*) from flyway_schema_history", Long.class)).isPositive();
		assertThat(SiteContext.callAs(Site.DEMO,
				() -> jdbc.queryForObject("select current_database()", String.class))).isEqualTo("ricettine_demo");
	}
}

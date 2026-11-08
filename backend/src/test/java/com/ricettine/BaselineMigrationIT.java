package com.ricettine;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.util.List;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.web.servlet.result.MockMvcResultMatchers;

class BaselineMigrationIT extends IntegrationTest {

	@Autowired
	JdbcTemplate jdbc;

	@Test
	void flywayCreatesSpringSessionTables() {
		List<String> tables = jdbc.queryForList(
				"select table_name from information_schema.tables where table_schema = 'public'", String.class);
		assertThat(tables).contains("spring_session", "spring_session_attributes");
	}

	@Test
	void otherEndpointsAreDeniedByDefault() throws Exception {
		mvc.perform(get("/api/anything")).andExpect(status().isUnauthorized())
			.andExpect(MockMvcResultMatchers.jsonPath("$.code").value("not_authenticated"));
	}
}

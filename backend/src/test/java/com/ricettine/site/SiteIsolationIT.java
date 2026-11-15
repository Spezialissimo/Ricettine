package com.ricettine.site;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;

import com.ricettine.DemoIntegrationTest;
import com.ricettine.Sessions;
import com.ricettine.account.AccountDtos.NewAccountRequest;
import jakarta.servlet.http.Cookie;
import javax.sql.DataSource;
import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.jdbc.autoconfigure.JdbcConnectionDetails;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DriverManagerDataSource;

class SiteIsolationIT extends DemoIntegrationTest {

	@Autowired
	private DataSource dataSource;

	@Autowired
	private JdbcConnectionDetails details;

	@Test
	void sameUsernameExistsIndependentlyPerSite() throws Exception {
		accounts.create(new NewAccountRequest("a@x.com", Sessions.PASSWORD, "alice", "Alice Main"), false);
		SiteContext.runAs(Site.DEMO,
				() -> accounts.create(new NewAccountRequest("a@x.com", Sessions.PASSWORD, "alice", "Alice Demo"), false));

		Cookie main = Sessions.login(mvc, "a@x.com");
		Cookie onDemo = demoLogin("a@x.com");
		mvc.perform(get("/api/users/alice/profile").cookie(main)).andExpect(status().isOk())
			.andExpect(jsonPath("$.person.displayName").value("Alice Main"));
		mvc.perform(demo(get("/api/users/alice/profile")).cookie(onDemo)).andExpect(status().isOk())
			.andExpect(jsonPath("$.person.displayName").value("Alice Demo"));
	}

	private Cookie demoLogin(String email) throws Exception {
		return mvc
			.perform(demo(post("/api/auth/login")).with(csrf()).contentType(MediaType.APPLICATION_JSON)
				.content("{\"email\":\"%s\",\"password\":\"%s\"}".formatted(email, Sessions.PASSWORD)))
			.andExpect(status().isOk()).andReturn().getResponse().getCookie("SESSION");
	}

	@Test
	void mainSessionIsNotValidOnDemo() throws Exception {
		Cookie cookie = data.user("bob", false);
		mvc.perform(get("/api/me").cookie(cookie)).andExpect(status().isOk());
		mvc.perform(demo(get("/api/me")).cookie(cookie)).andExpect(status().isUnauthorized());
	}

	@Test
	void demoWritesNeverReachMain() throws Exception {
		SiteContext.runAs(Site.DEMO,
				() -> accounts.create(new NewAccountRequest("d@x.com", Sessions.PASSWORD, "dave", "Dave"), false));
		Cookie cookie = demoLogin("d@x.com");
		mvc.perform(demo(post("/api/recipes")).with(csrf()).cookie(cookie)).andExpect(status().isCreated());

		JdbcTemplate mainOnly = new JdbcTemplate(
				new DriverManagerDataSource(details.getJdbcUrl(), details.getUsername(), details.getPassword()));
		assertThat(mainOnly.queryForObject("select count(*) from recipe", Long.class)).isZero();
		assertThat(mainOnly.queryForObject("select count(*) from app_user", Long.class)).isZero();
		assertThat(SiteContext.callAs(Site.DEMO, () -> jdbc.queryForObject("select count(*) from recipe", Long.class)))
			.isEqualTo(1L);
	}

	@Test
	void demoDatabaseIsRecreatedOnStartup() {
		String scratch = "ricettine_demo_recreate_it";
		DemoDatabase.recreate(dataSource, scratch);
		String url = JdbcUrls.withDatabase(details.getJdbcUrl(), scratch);
		try {
			DriverManagerDataSource scratchDs = new DriverManagerDataSource(url, details.getUsername(),
					details.getPassword());
			JdbcTemplate scratchJdbc = new JdbcTemplate(scratchDs);
			scratchJdbc.execute("create table marker (id int)");
			DemoDatabase.recreate(dataSource, scratch);
			Flyway.configure().dataSource(scratchDs).locations("classpath:db/migration").load().migrate();

			assertThat(scratchJdbc.queryForObject("select count(*) from information_schema.tables where table_name = 'marker'",
					Long.class)).isZero();
			assertThat(scratchJdbc.queryForObject(
					"select count(*) from information_schema.tables where table_name = 'flyway_schema_history'",
					Long.class)).isEqualTo(1L);
		}
		finally {
			jdbc.execute("drop database if exists \"" + scratch + "\" with (force)");
		}
	}
}

package com.ricettine.auth;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.ricettine.IntegrationTest;
import com.ricettine.Sessions;
import com.ricettine.account.AccountDtos.NewAccountRequest;
import com.ricettine.account.AccountService;
import jakarta.servlet.http.Cookie;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;

class UnreadableSessionIT extends IntegrationTest {

	@Autowired JdbcTemplate jdbc;
	@Autowired AccountService accounts;

	@Test
	void unreadableSessionMeansLoggedOut() throws Exception {
		jdbc.execute("truncate table app_user, one_time_token, instance_setup cascade");
		jdbc.execute("delete from spring_session");
		accounts.create(new NewAccountRequest("u@x.com", Sessions.PASSWORD, "unreadable", "U"), false);
		Cookie cookie = Sessions.login(mvc, "u@x.com");
		mvc.perform(get("/api/me").cookie(cookie)).andExpect(status().isOk());

		int rows = jdbc.update("update spring_session_attributes set attribute_bytes = ?", new byte[] {0, 1});
		assertThat(rows).isPositive();

		mvc.perform(get("/api/me").cookie(cookie)).andExpect(status().isUnauthorized())
				.andExpect(jsonPath("$.code").value("not_authenticated"));

		Cookie fresh = Sessions.login(mvc, "u@x.com");
		assertThat(fresh).isNotNull();
		mvc.perform(get("/api/me").cookie(fresh)).andExpect(status().isOk());
	}
}

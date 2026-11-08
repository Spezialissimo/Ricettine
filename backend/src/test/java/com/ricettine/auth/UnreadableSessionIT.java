package com.ricettine.auth;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.ricettine.IntegrationTest;
import com.ricettine.Sessions;
import jakarta.servlet.http.Cookie;
import org.junit.jupiter.api.Test;

class UnreadableSessionIT extends IntegrationTest {


	@Test
	void unreadableSessionMeansLoggedOut() throws Exception {
		Cookie cookie = data.user("u@x.com", "unreadable", "U", false);
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

package com.ricettine.profile;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.ricettine.IntegrationTest;
import com.ricettine.Sessions;
import com.ricettine.account.AccountDtos.NewAccountRequest;
import jakarta.servlet.http.Cookie;
import org.junit.jupiter.api.Test;

class ProfileRateLimitIT extends IntegrationTest {


	@Test
	void profileReadsLimitedPerUser() throws Exception {
		accounts.create(new NewAccountRequest("a@x.com", Sessions.PASSWORD, "alice", "Alice"), true);
		accounts.create(new NewAccountRequest("b@x.com", Sessions.PASSWORD, "bob", "Bob"), false);
		Cookie a = Sessions.login(mvc, "a@x.com");
		Cookie b = Sessions.login(mvc, "b@x.com");
		for (int i = 0; i < 120; i++) {
			mvc.perform(get("/api/users/bob/profile").cookie(a)).andExpect(status().isOk());
		}
		mvc.perform(get("/api/users/bob/profile").cookie(a)).andExpect(status().isTooManyRequests())
			.andExpect(jsonPath("$.code").value("too_many_attempts")).andExpect(header().exists("Retry-After"));
		mvc.perform(get("/api/users/alice/profile").cookie(b)).andExpect(status().isOk());
	}
}

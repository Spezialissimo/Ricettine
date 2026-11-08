package com.ricettine.auth;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;

import com.ricettine.IntegrationTest;
import com.ricettine.Sessions;
import com.ricettine.account.AccountDtos.NewAccountRequest;
import com.ricettine.common.MutableClock;
import java.time.Duration;
import java.util.UUID;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MvcResult;

/** Per-account login limit: 10 failures per 15 minutes, counted for unknown emails too. */
class LoginRateLimitIT extends IntegrationTest {

	@Autowired MutableClock clock;

	@AfterEach
	void resetClock() {
		clock.reset();
	}

	private String newAccount() {
		String id = UUID.randomUUID().toString().substring(0, 8);
		String email = "rl-" + id + "@x.com";
		accounts.create(new NewAccountRequest(email, Sessions.PASSWORD, "rl" + id, "Rl"), false);
		return email;
	}

	private MvcResult login(String email, String password, String ip) throws Exception {
		return mvc.perform(post("/api/auth/login").with(csrf()).with(r -> {
			r.setRemoteAddr(ip);
			return r;
		}).contentType(MediaType.APPLICATION_JSON)
			.content("{\"email\":\"%s\",\"password\":\"%s\"}".formatted(email, password))).andReturn();
	}

	private void fail(String email, int times, String ipPrefix) throws Exception {
		for (int i = 0; i < times; i++) {
			assertThat(login(email, "wrong-password-1", ipPrefix + i).getResponse().getStatus()).isEqualTo(401);
		}
	}

	@Test
	void accountLimited() throws Exception {
		String email = newAccount();
		fail(email, 10, "10.1.0.");
		MvcResult r = login(email, Sessions.PASSWORD, "10.1.1.1");
		assertThat(r.getResponse().getStatus()).isEqualTo(429);
		assertThat(r.getResponse().getContentAsString()).contains("\"code\":\"too_many_attempts\"");
		long retry = Long.parseLong(r.getResponse().getHeader("Retry-After"));
		assertThat(retry).isBetween(1L, 900L);
		assertThat(r.getResponse().getContentAsString()).contains("\"retryAfter\":" + retry);
	}

	@Test
	void successClears() throws Exception {
		String email = newAccount();
		fail(email, 9, "10.2.0.");
		assertThat(login(email, Sessions.PASSWORD, "10.2.1.1").getResponse().getStatus()).isEqualTo(200);
		fail(email, 9, "10.2.2.");
	}

	@Test
	void unknownEmailCountsToo() throws Exception {
		String email = "nobody-" + UUID.randomUUID() + "@x.com";
		fail(email, 10, "10.3.0.");
		assertThat(login(email, "wrong-password-1", "10.3.1.1").getResponse().getStatus()).isEqualTo(429);
	}

	@Test
	void accountWindowExpires() throws Exception {
		String email = newAccount();
		fail(email, 10, "10.4.0.");
		assertThat(login(email, Sessions.PASSWORD, "10.4.1.1").getResponse().getStatus()).isEqualTo(429);
		clock.advance(Duration.ofMinutes(15));
		assertThat(login(email, Sessions.PASSWORD, "10.4.1.1").getResponse().getStatus()).isEqualTo(200);
	}
}

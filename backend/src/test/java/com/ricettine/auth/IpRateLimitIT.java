package com.ricettine.auth;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.atMost;
import static org.mockito.Mockito.clearInvocations;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;

import com.ricettine.IntegrationTest;
import com.ricettine.Sessions;
import com.ricettine.account.AccountDtos.NewAccountRequest;
import com.ricettine.testsupport.Concurrently;
import jakarta.servlet.http.Cookie;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.context.bean.override.mockito.MockitoSpyBean;
import org.springframework.test.web.servlet.MvcResult;

/** The per-IP limits at their real value (30); IntegrationTest turns them off for every other suite. */
@TestPropertySource(properties = { "ricettine.limits.login-ip.limit=30", "ricettine.limits.anonymous-auth.limit=30" })
class IpRateLimitIT extends IntegrationTest {

	@MockitoSpyBean PasswordEncoder encoder;

	private MvcResult login(String email, String ip) throws Exception {
		return mvc.perform(post("/api/auth/login").with(csrf()).with(r -> {
			r.setRemoteAddr(ip);
			return r;
		}).contentType(MediaType.APPLICATION_JSON)
			.content("{\"email\":\"%s\",\"password\":\"wrong-password-1\"}".formatted(email))).andReturn();
	}

	private int resetAttempt(String ip) throws Exception {
		return mvc.perform(post("/api/password-resets/" + UUID.randomUUID()).with(csrf()).with(r -> {
			r.setRemoteAddr(ip);
			return r;
		}).contentType(MediaType.APPLICATION_JSON).content("{\"newPassword\":\"correct-horse-2\"}"))
			.andReturn().getResponse().getStatus();
	}

	private void thirtyFailures(String ip) throws Exception {
		for (int i = 0; i < 30; i++) {
			assertThat(login("ip-" + UUID.randomUUID() + "@x.com", ip).getResponse().getStatus()).isEqualTo(401);
		}
	}

	@Test
	void ipLimited() throws Exception {
		thirtyFailures("10.5.0.1");
		MvcResult limited = login("ip-new@x.com", "10.5.0.1");
		assertThat(limited.getResponse().getStatus()).isEqualTo(429);
		assertThat(Long.parseLong(limited.getResponse().getHeader("Retry-After"))).isBetween(1L, 900L);
		assertThat(login("ip-new@x.com", "10.5.0.2").getResponse().getStatus()).isEqualTo(401);
	}

	@Test
	void limitedBeforeHashing() throws Exception {
		thirtyFailures("10.6.0.1");
		clearInvocations(encoder);
		assertThat(login("ip-new@x.com", "10.6.0.1").getResponse().getStatus()).isEqualTo(429);
		verify(encoder, never()).matches(any(), any());
	}

	@Test
	void anonymousAuthLimited() throws Exception {
		for (int i = 0; i < 30; i++) {
			assertThat(resetAttempt("10.7.0.1")).isEqualTo(404);
		}
		assertThat(resetAttempt("10.7.0.1")).isEqualTo(429);
		assertThat(resetAttempt("10.7.0.2")).isEqualTo(404);
	}

	private String newAccount() {
		String id = UUID.randomUUID().toString().substring(0, 8);
		String email = "ip-" + id + "@x.com";
		accounts.create(new NewAccountRequest(email, Sessions.PASSWORD, "ip" + id, "Ip"), false);
		return email;
	}

	@Test
	void concurrentWrongPasswordsReachTheHashAtMostTenTimes() throws Exception {
		String email = newAccount();
		clearInvocations(encoder);
		List<Integer> statuses = Concurrently.run(20, i -> () -> login(email, "10.8.0." + i).getResponse().getStatus());
		long unauthorized = statuses.stream().filter(status -> status == 401).count();
		long limited = statuses.stream().filter(status -> status == 429).count();
		assertThat(unauthorized).isEqualTo(10);
		assertThat(limited).isEqualTo(10);
		verify(encoder, atMost(10)).matches(any(), any());
	}

	private int changePassword(Cookie session, String current) throws Exception {
		return mvc.perform(put("/api/me/password").with(csrf()).cookie(session).contentType(MediaType.APPLICATION_JSON)
			.content("{\"currentPassword\":\"%s\",\"newPassword\":\"brand-new-pass-1\"}".formatted(current)))
			.andReturn().getResponse().getStatus();
	}

	@Test
	void passwordChangeSharesTheLoginAccountLimit() throws Exception {
		String email = newAccount();
		Cookie session = Sessions.login(mvc, email);
		for (int i = 0; i < 10; i++) {
			assertThat(changePassword(session, "wrong-password-1")).isEqualTo(400);
		}
		clearInvocations(encoder);
		assertThat(changePassword(session, Sessions.PASSWORD)).isEqualTo(429);
		verify(encoder, never()).matches(any(), any());
		assertThat(login(email, "10.9.0.1").getResponse().getStatus()).isEqualTo(429);
	}

	@Test
	void accountDeletionSharesTheLoginAccountLimit() throws Exception {
		String email = newAccount();
		Cookie session = Sessions.login(mvc, email);
		for (int i = 0; i < 10; i++) {
			assertThat(mvc.perform(delete("/api/me").with(csrf()).cookie(session)
				.contentType(MediaType.APPLICATION_JSON).content("{\"password\":\"wrong-password-1\"}"))
				.andReturn().getResponse().getStatus()).isEqualTo(400);
		}
		clearInvocations(encoder);
		assertThat(mvc.perform(delete("/api/me").with(csrf()).cookie(session).contentType(MediaType.APPLICATION_JSON)
			.content("{\"password\":\"%s\"}".formatted(Sessions.PASSWORD))).andReturn().getResponse().getStatus())
			.isEqualTo(429);
		verify(encoder, never()).matches(any(), any());
	}
}

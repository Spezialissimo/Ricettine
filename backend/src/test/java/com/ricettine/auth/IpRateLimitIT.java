package com.ricettine.auth;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.clearInvocations;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;

import com.ricettine.IntegrationTest;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
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
		assertThat(login("ip-new@x.com", "10.5.0.1").getResponse().getStatus()).isEqualTo(429);
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
}

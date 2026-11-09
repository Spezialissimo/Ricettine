package com.ricettine.auth;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;

import com.ricettine.IntegrationTest;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.client.JdkClientHttpRequestFactory;
import org.springframework.test.context.TestPropertySource;
import org.springframework.web.client.RestClient;

/**
 * Forwarded-header trust for the per-IP limits (limit 30). The spoofing test runs over MockMvc from an address that is
 * not a trusted proxy; the proxy test goes through the real Tomcat, whose loopback peer is an internal proxy.
 */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT,
		properties = "ricettine.storage.local.path=target/test-media")
@TestPropertySource(properties = { "ricettine.limits.login-ip.limit=30", "ricettine.limits.anonymous-auth.limit=30" })
class ForwardedHeaderTrustIT extends IntegrationTest {

	@LocalServerPort int port;

	@Test
	void spoofedForwardedHeadersDoNotResetIpLimit() throws Exception {
		int last = 0;
		for (int i = 0; i < 31; i++) {
			last = mvc.perform(post("/api/auth/login").with(csrf()).with(r -> {
				r.setRemoteAddr("203.0.113.7");
				return r;
			}).header("X-Forwarded-For", "192.0.2." + (i + 1)).header("Forwarded", "for=192.0.2." + (i + 100))
				.contentType(MediaType.APPLICATION_JSON)
				.content("{\"email\":\"fh-%s@x.com\",\"password\":\"wrong-password-1\"}".formatted(UUID.randomUUID())))
				.andReturn().getResponse().getStatus();
			if (i < 30) {
				assertThat(last).as("attempt %d", i + 1).isEqualTo(401);
			}
		}
		assertThat(last).isEqualTo(429);
	}

	private RestClient client() {
		return RestClient.builder().requestFactory(new JdkClientHttpRequestFactory()).baseUrl("http://localhost:" + port).build();
	}

	private int login(String xsrf, String forwardedFor) {
		return client().post().uri("/api/auth/login").contentType(MediaType.APPLICATION_JSON).headers(h -> {
			h.set("X-XSRF-TOKEN", xsrf);
			h.set(HttpHeaders.COOKIE, "XSRF-TOKEN=" + xsrf);
			h.set("X-Forwarded-For", forwardedFor);
		}).body("{\"email\":\"fh-%s@x.com\",\"password\":\"wrong-password-1\"}".formatted(UUID.randomUUID()))
			.exchange((req, res) -> res.getStatusCode().value());
	}

	@Test
	void trustedProxyForwardedForIsHonoured() {
		List<String> setCookies = client().get().uri("/api/setup/status")
			.exchange((req, res) -> res.getHeaders().get(HttpHeaders.SET_COOKIE));
		String xsrf = setCookies.stream().filter(c -> c.startsWith("XSRF-TOKEN=")).findFirst().orElseThrow();
		String token = xsrf.substring("XSRF-TOKEN=".length(), xsrf.indexOf(';'));

		// The peer (loopback) is an internal proxy, so the right-most untrusted entry is the client.
		for (int i = 0; i < 30; i++) {
			assertThat(login(token, "198.51.100.1, 198.51.100.2")).isEqualTo(401);
		}
		assertThat(login(token, "198.51.100.1, 198.51.100.2")).isEqualTo(429);
		// Same left-most entry, different right-most: a different client.
		assertThat(login(token, "198.51.100.1, 198.51.100.3")).isEqualTo(401);
	}
}

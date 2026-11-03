package com.ricettine.auth;

import static org.assertj.core.api.Assertions.assertThat;

import com.ricettine.IntegrationTest;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.web.client.RestClient;

@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
class CsrfIT extends IntegrationTest {

	@LocalServerPort int port;

	private RestClient client() {
		return RestClient.builder().baseUrl("http://localhost:" + port).build();
	}

	private int loginStatus(String token, String cookie) {
		return client().post().uri("/api/auth/login").contentType(MediaType.APPLICATION_JSON)
			.headers(h -> {
				if (token != null) {
					h.set("X-XSRF-TOKEN", token);
				}
				if (cookie != null) {
					h.set(HttpHeaders.COOKIE, cookie);
				}
			})
			.body("{\"email\":\"nobody@x.com\",\"password\":\"whatever-1234\"}")
			.exchange((req, res) -> res.getStatusCode().value());
	}

	@Test
	void postWithoutTokenIs403() {
		assertThat(loginStatus(null, null)).isEqualTo(403);
	}

	@Test
	void tokenFromCookieIsAccepted() {
		List<String> setCookies = client().get().uri("/api/setup/status")
			.exchange((req, res) -> res.getHeaders().get(HttpHeaders.SET_COOKIE));
		assertThat(setCookies).isNotNull();
		String xsrf = setCookies.stream().filter(c -> c.startsWith("XSRF-TOKEN=")).findFirst().orElseThrow();
		String value = xsrf.substring("XSRF-TOKEN=".length(), xsrf.indexOf(';'));
		assertThat(xsrf).doesNotContain("HttpOnly");
		// valid token + matching cookie: passes CSRF, fails on credentials (401), never 403
		assertThat(loginStatus(value, "XSRF-TOKEN=" + value)).isEqualTo(401);
	}
}

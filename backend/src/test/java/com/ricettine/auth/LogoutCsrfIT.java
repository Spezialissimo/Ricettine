package com.ricettine.auth;

import static org.assertj.core.api.Assertions.assertThat;

import com.ricettine.IntegrationTest;
import com.ricettine.Sessions;
import java.util.List;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.web.client.RestClient;

/** The SPA logs in again straight after logout with no GET in between: the logout response must re-arm CSRF. */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
class LogoutCsrfIT extends IntegrationTest {

	record Res(int status, List<String> setCookies) {
	}

	@LocalServerPort int port;
	@Autowired JdbcTemplate jdbc;

	@BeforeEach
	void clean() {
		jdbc.execute("truncate table app_user, one_time_token, instance_setup cascade");
		jdbc.execute("delete from spring_session");
	}

	private Res post(String uri, String xsrf, String cookies, String body) {
		return RestClient.builder().baseUrl("http://localhost:" + port).build().post().uri(uri)
			.contentType(MediaType.APPLICATION_JSON)
			.headers(h -> {
				h.set("X-XSRF-TOKEN", xsrf);
				h.set(HttpHeaders.COOKIE, cookies);
			})
			.body(body == null ? "" : body)
			.exchange((req, res) -> new Res(res.getStatusCode().value(),
					res.getHeaders().getOrEmpty(HttpHeaders.SET_COOKIE)));
	}

	/** Value of the last Set-Cookie for {@code name} (browsers apply them in order), or null. */
	private static String lastCookie(List<String> setCookies, String name) {
		String value = null;
		for (String c : setCookies) {
			if (c.startsWith(name + "=")) {
				int end = c.indexOf(';');
				value = c.substring(name.length() + 1, end < 0 ? c.length() : end);
			}
		}
		return value;
	}

	@Test
	void loginRightAfterLogoutSucceeds() {
		List<String> statusCookies = RestClient.builder().baseUrl("http://localhost:" + port).build().get()
			.uri("/api/setup/status").exchange((req, res) -> res.getHeaders().getOrEmpty(HttpHeaders.SET_COOKIE));
		String xsrf = lastCookie(statusCookies, "XSRF-TOKEN");
		assertThat(xsrf).isNotEmpty();

		Res setup = post("/api/setup/admin", xsrf, "XSRF-TOKEN=" + xsrf,
				"{\"email\":\"a@x.com\",\"password\":\"%s\",\"username\":\"boss\",\"displayName\":\"Boss\"}"
					.formatted(Sessions.PASSWORD));
		assertThat(setup.status()).isEqualTo(201);
		String session = lastCookie(setup.setCookies(), "SESSION");
		assertThat(session).isNotEmpty();

		Res logout = post("/api/auth/logout", xsrf, "XSRF-TOKEN=" + xsrf + "; SESSION=" + session, null);
		assertThat(logout.status()).isEqualTo(204);
		String fresh = lastCookie(logout.setCookies(), "XSRF-TOKEN");
		assertThat(fresh).as("logout must issue a fresh XSRF-TOKEN").isNotEmpty().isNotEqualTo(xsrf);

		Res login = post("/api/auth/login", fresh, "XSRF-TOKEN=" + fresh,
				"{\"email\":\"a@x.com\",\"password\":\"%s\"}".formatted(Sessions.PASSWORD));
		assertThat(login.status()).isEqualTo(200);
	}
}

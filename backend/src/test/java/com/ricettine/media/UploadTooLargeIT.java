package com.ricettine.media;

import static org.assertj.core.api.Assertions.assertThat;

import com.ricettine.IntegrationTest;
import com.ricettine.Sessions;
import com.ricettine.account.AccountDtos.NewAccountRequest;
import com.ricettine.account.AccountService;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.core.io.ByteArrayResource;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.util.LinkedMultiValueMap;
import org.springframework.web.client.RestClient;

/**
 * MockMvc does not enforce multipart limits, so the 413 contract is pinned over real HTTP against the embedded
 * Tomcat: an oversize upload must come back as 413 file_too_large, not as a broken pipe or a bare container error.
 * Everything here goes over HTTP: MockMvc's csrf() post-processor swaps the shared CsrfFilter's token repository.
 */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
class UploadTooLargeIT extends IntegrationTest {

	@LocalServerPort int port;
	@Autowired JdbcTemplate jdbc;
	@Autowired AccountService accounts;

	private static String cookieValue(List<String> setCookies, String name) {
		String c = setCookies.stream().filter(s -> s.startsWith(name + "=")).findFirst().orElseThrow();
		return c.substring(name.length() + 1, c.indexOf(';'));
	}

	@org.springframework.beans.factory.annotation.Value("${spring.servlet.multipart.location}")
	String uploadDir;

	@Test
	void uploadStillWorksAfterTheSpoolDirectoryIsDeleted() throws Exception {
		java.nio.file.Path dir = java.nio.file.Path.of(uploadDir);
		try (var files = java.nio.file.Files.walk(dir)) {
			files.sorted(java.util.Comparator.reverseOrder()).forEach(p -> p.toFile().delete());
		}
		assertThat(dir).doesNotExist();
		String status = upload(new byte[1000]);
		// reaches the avatar handler (not a container error): 415 "unsupported image", not 5xx/413
		assertThat(status).doesNotStartWith("5").doesNotStartWith("413").doesNotStartWith("403");
		assertThat(dir).isDirectory();
	}

	@Test
	void oversizeUploadIs413() {
		assertThat(upload(new byte[16 * 1024 * 1024 + 1])).startsWith("413").contains("file_too_large");
	}

	private String upload(byte[] bytes) {
		jdbc.execute("truncate table app_user, one_time_token, instance_setup cascade");
		accounts.create(new NewAccountRequest("big@x.com", Sessions.PASSWORD, "bigupload", "Big"), false);
		RestClient client = RestClient.builder().baseUrl("http://localhost:" + port).build();

		String xsrf = cookieValue(client.get().uri("/api/setup/status")
			.exchange((req, res) -> res.getHeaders().get(HttpHeaders.SET_COOKIE)), "XSRF-TOKEN");
		List<String> loginCookies = client.post().uri("/api/auth/login").contentType(MediaType.APPLICATION_JSON)
			.header(HttpHeaders.COOKIE, "XSRF-TOKEN=" + xsrf).header("X-XSRF-TOKEN", xsrf)
			.body("{\"email\":\"big@x.com\",\"password\":\"" + Sessions.PASSWORD + "\"}")
			.exchange((req, res) -> res.getHeaders().get(HttpHeaders.SET_COOKIE));
		String session = cookieValue(loginCookies, "SESSION");

		LinkedMultiValueMap<String, Object> body = new LinkedMultiValueMap<>();
		body.add("file", new ByteArrayResource(bytes) {
			@Override
			public String getFilename() {
				return "big.jpg";
			}
		});
		String result = client.put().uri("/api/me/avatar").contentType(MediaType.MULTIPART_FORM_DATA)
			.header(HttpHeaders.COOKIE, "SESSION=" + session + "; XSRF-TOKEN=" + xsrf).header("X-XSRF-TOKEN", xsrf)
			.body(body)
			.exchange((req, res) -> res.getStatusCode().value() + " " + new String(res.getBody().readAllBytes()));
		return result;
	}
}

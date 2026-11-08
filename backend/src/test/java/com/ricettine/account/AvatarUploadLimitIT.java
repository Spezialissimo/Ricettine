package com.ricettine.account;

import static org.assertj.core.api.Assertions.assertThat;

import com.ricettine.IntegrationTest;
import com.ricettine.Sessions;
import com.ricettine.account.AccountDtos.NewAccountRequest;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import java.util.stream.Stream;
import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;

/** Real Tomcat multipart parsing: MockMvc does not enforce the servlet container's upload limits. */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
class AvatarUploadLimitIT extends IntegrationTest {

	@LocalServerPort int port;

	private static long blobCount() throws Exception {
		Path dir = Path.of("target/test-media/img");
		if (!Files.exists(dir)) {
			return 0;
		}
		try (Stream<Path> s = Files.list(dir)) {
			return s.count();
		}
	}

	private static String cookieValue(HttpResponse<?> r, String name) {
		return r.headers().allValues("Set-Cookie").stream().filter(c -> c.startsWith(name + "="))
			.map(c -> c.substring(name.length() + 1, c.indexOf(';'))).findFirst().orElseThrow();
	}

	@Test
	void oversizedAvatarIs413WithCodeAndNoBlob() throws Exception {
		accounts.create(new NewAccountRequest("big@x.com", Sessions.PASSWORD, "bigger", "Big"), false);
		HttpClient http = HttpClient.newHttpClient();
		String base = "http://localhost:" + port;

		HttpResponse<String> first = http.send(HttpRequest.newBuilder(URI.create(base + "/api/setup/status")).build(),
				HttpResponse.BodyHandlers.ofString());
		String xsrf = cookieValue(first, "XSRF-TOKEN");
		HttpResponse<String> login = http.send(HttpRequest.newBuilder(URI.create(base + "/api/auth/login"))
			.header("Content-Type", "application/json").header("X-XSRF-TOKEN", xsrf)
			.header("Cookie", "XSRF-TOKEN=" + xsrf)
			.POST(HttpRequest.BodyPublishers.ofString(
					"{\"email\":\"big@x.com\",\"password\":\"%s\"}".formatted(Sessions.PASSWORD)))
			.build(), HttpResponse.BodyHandlers.ofString());
		assertThat(login.statusCode()).isEqualTo(200);
		String session = cookieValue(login, "SESSION");

		String boundary = "----ricettine";
		byte[] head = ("--" + boundary + "\r\nContent-Disposition: form-data; name=\"file\"; filename=\"big.jpg\"\r\n"
				+ "Content-Type: image/jpeg\r\n\r\n").getBytes(StandardCharsets.US_ASCII);
		byte[] tail = ("\r\n--" + boundary + "--\r\n").getBytes(StandardCharsets.US_ASCII);
		byte[] payload = new byte[15 * 1024 * 1024 + 1024];
		long before = blobCount();
		HttpResponse<String> res = http.send(HttpRequest.newBuilder(URI.create(base + "/api/me/avatar"))
			.header("Content-Type", "multipart/form-data; boundary=" + boundary)
			.header("X-XSRF-TOKEN", xsrf)
			.header("Cookie", "XSRF-TOKEN=" + xsrf + "; SESSION=" + session)
			.PUT(HttpRequest.BodyPublishers.ofByteArrays(List.of(head, payload, tail))).build(),
				HttpResponse.BodyHandlers.ofString());
		assertThat(res.statusCode()).isEqualTo(413);
		assertThat(res.headers().firstValue("Content-Type").orElse("")).contains("problem+json");
		assertThat(res.body()).contains("\"code\":\"file_too_large\"");
		assertThat(blobCount()).isEqualTo(before);
	}
}

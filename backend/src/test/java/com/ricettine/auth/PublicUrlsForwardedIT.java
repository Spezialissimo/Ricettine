package com.ricettine.auth;

import static org.assertj.core.api.Assertions.assertThat;

import com.ricettine.IntegrationTest;
import jakarta.servlet.http.Cookie;
import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.http.HttpHeaders;
import org.springframework.http.client.JdkClientHttpRequestFactory;
import org.springframework.web.client.RestClient;
import tools.jackson.databind.JsonNode;

/**
 * Links handed to users are built from the request when ricettine.base-url is unset. Behind a reverse proxy that must
 * be the public URL from X-Forwarded-Proto and -Host, so this goes through the real Tomcat, whose loopback peer is an
 * internal proxy (MockMvc has no remote-ip valve).
 */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT,
		properties = "ricettine.storage.local.path=target/test-media")
class PublicUrlsForwardedIT extends IntegrationTest {

	@LocalServerPort int port;

	private JsonNode recipe(Cookie session, String id, String... forwardedHeaders) throws Exception {
		RestClient client = RestClient.builder().requestFactory(new JdkClientHttpRequestFactory())
			.baseUrl("http://localhost:" + port).build();
		String body = client.get().uri("/api/recipes/" + id).headers(h -> {
			h.set(HttpHeaders.COOKIE, "SESSION=" + session.getValue());
			for (int i = 0; i < forwardedHeaders.length; i += 2) {
				h.set(forwardedHeaders[i], forwardedHeaders[i + 1]);
			}
		}).retrieve().body(String.class);
		return json.readTree(body);
	}

	@Test
	void shareUrlUsesTheForwardedSchemeAndHost() throws Exception {
		Cookie me = data.user("me@x.com", "mario", "Me", true);
		String id = data.publishedRecipe(me, "PRIVATE");
		String token = data.recipeShareToken(id);

		assertThat(recipe(me, id).get("shareUrl").asText()).isEqualTo("http://localhost:" + port + "/r/" + token);
		assertThat(recipe(me, id, "X-Forwarded-Proto", "https", "X-Forwarded-Host", "recipes.example.com")
			.get("shareUrl").asText()).isEqualTo("https://recipes.example.com/r/" + token);
	}
}

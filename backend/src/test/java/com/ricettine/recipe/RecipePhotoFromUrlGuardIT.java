package com.ricettine.recipe;

import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.ricettine.IntegrationTest;
import jakarta.servlet.http.Cookie;
import java.util.Map;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;

/** With production settings, a photo address on this server's own network is refused before any connection. */
class RecipePhotoFromUrlGuardIT extends IntegrationTest {

	@Test
	void refusesLoopbackPrivateAndMetadataAddressesAndNonWebSchemes() throws Exception {
		Cookie me = data.user("me@x.com", "mario", "Me", true);
		String id = data.draft(me);
		for (String url : new String[] { "http://127.0.0.1:8080/actuator/health", "http://localhost/x.jpg",
				"http://169.254.169.254/latest/meta-data/", "http://[::1]/x.jpg", "http://10.0.0.5/x.jpg" }) {
			mvc.perform(post("/api/recipes/" + id + "/photos/from-url").with(csrf()).cookie(me)
				.contentType(MediaType.APPLICATION_JSON).content(json.writeValueAsString(Map.of("url", url))))
				.andExpect(status().isBadRequest())
				.andExpect(jsonPath("$.code").value(url.contains(":8080") ? "image_url_invalid" : "image_url_not_allowed"));
		}
		mvc.perform(post("/api/recipes/" + id + "/photos/from-url").with(csrf()).cookie(me)
			.contentType(MediaType.APPLICATION_JSON).content(json.writeValueAsString(Map.of("url", "file:///etc/passwd"))))
			.andExpect(status().isBadRequest()).andExpect(jsonPath("$.code").value("image_url_invalid"));
	}

	@Test
	void requiresLogin() throws Exception {
		mvc.perform(post("/api/recipes/" + java.util.UUID.randomUUID() + "/photos/from-url").with(csrf())
			.contentType(MediaType.APPLICATION_JSON).content("{\"url\":\"https://example.com/x.jpg\"}"))
			.andExpect(status().isUnauthorized());
	}
}

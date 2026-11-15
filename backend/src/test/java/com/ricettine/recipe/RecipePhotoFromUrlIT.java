package com.ricettine.recipe;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.ricettine.IntegrationTest;
import com.ricettine.media.TestImages;
import com.sun.net.httpserver.HttpServer;
import jakarta.servlet.http.Cookie;
import java.io.OutputStream;
import java.net.InetSocketAddress;
import java.util.UUID;
import java.util.concurrent.atomic.AtomicInteger;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.test.annotation.DirtiesContext;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.web.servlet.ResultActions;

/**
 * A photo given by its web address, served from the loopback interface; the test-only switch lets the fetcher
 * reach it. The address rules themselves (private ranges, ports, schemes, redirects, size) are covered by
 * RemoteImageFetcherTest and, with production settings, by RecipePhotoFromUrlGuardIT.
 */
@TestPropertySource(properties = "ricettine.remote-images.allow-private-addresses=true")
// the property makes a context of its own: close it after this class, so its connection pool does not stay
// open for the rest of the suite (the shared Postgres container would run out of connections)
@DirtiesContext
class RecipePhotoFromUrlIT extends IntegrationTest {

	HttpServer server;
	final AtomicInteger requests = new AtomicInteger();
	Cookie me;
	Cookie other;

	@BeforeEach
	void setUp() throws Exception {
		me = data.user("me@x.com", "mario", "Me", true);
		other = data.user("other@x.com", "other1", "Other", false);
		byte[] jpeg = TestImages.plainJpeg(800, 600);
		server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
		server.createContext("/", ex -> {
			requests.incrementAndGet();
			boolean photo = ex.getRequestURI().getPath().equals("/photo.jpg");
			byte[] body = photo ? jpeg : "<html></html>".getBytes();
			ex.getResponseHeaders().set("Content-Type", photo ? "image/jpeg" : "text/html");
			ex.sendResponseHeaders(200, body.length);
			try (OutputStream out = ex.getResponseBody()) {
				out.write(body);
			}
		});
		server.start();
	}

	@AfterEach
	void stop() {
		server.stop(0);
	}

	String url(String path) {
		return "http://127.0.0.1:" + server.getAddress().getPort() + path;
	}

	ResultActions fromUrl(Cookie who, String recipeId, String url) throws Exception {
		return mvc.perform(post("/api/recipes/" + recipeId + "/photos/from-url").with(csrf()).cookie(who)
			.contentType(MediaType.APPLICATION_JSON).content(json.writeValueAsString(java.util.Map.of("url", url))));
	}

	@Test
	void downloadsProcessesAndRegistersThePhotoLikeAnUpload() throws Exception {
		String id = data.draft(me);
		String mediaId = json.readTree(fromUrl(me, id, url("/photo.jpg")).andExpect(status().isCreated())
			.andExpect(jsonPath("$.thumbUrl").isNotEmpty()).andReturn().getResponse().getContentAsString())
			.get("mediaId").asText();
		assertThat(jdbc.queryForObject("select kind from media where id = ? and recipe_id = ?::uuid", String.class,
				mediaId, id)).isEqualTo("RECIPE");
		mvc.perform(get("/media/" + mediaId + "/thumb.jpg").cookie(me)).andExpect(status().isOk());
	}

	@Test
	void aNonOwnerIsRefusedBeforeAnythingIsDownloaded() throws Exception {
		String id = data.draft(me);
		fromUrl(other, id, url("/photo.jpg")).andExpect(status().isNotFound())
			.andExpect(jsonPath("$.code").value("recipe_not_found"));
		fromUrl(me, UUID.randomUUID().toString(), url("/photo.jpg")).andExpect(status().isNotFound());
		assertThat(requests).hasValue(0);
		assertThat(jdbc.queryForObject("select count(*) from media", Integer.class)).isZero();
	}

	@Test
	void aWebPageIsNotAPhoto() throws Exception {
		String id = data.draft(me);
		fromUrl(me, id, url("/page.html")).andExpect(status().isUnsupportedMediaType())
			.andExpect(jsonPath("$.code").value("unsupported_image"));
		assertThat(jdbc.queryForObject("select count(*) from media", Integer.class)).isZero();
	}

	@Test
	void theAddressIsRequiredAndBounded() throws Exception {
		String id = data.draft(me);
		fromUrl(me, id, " ").andExpect(status().isBadRequest());
		fromUrl(me, id, "http://example.com/" + "a".repeat(2100)).andExpect(status().isBadRequest());
		assertThat(requests).hasValue(0);
	}
}

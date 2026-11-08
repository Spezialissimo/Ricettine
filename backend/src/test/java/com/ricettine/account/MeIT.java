package com.ricettine.account;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.multipart;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.ricettine.IntegrationTest;
import com.ricettine.QuietSqlErrors;
import com.ricettine.Sessions;
import com.ricettine.account.AccountDtos.NewAccountRequest;
import com.ricettine.media.BlobStore;
import com.ricettine.media.TestImages;
import jakarta.servlet.http.Cookie;
import java.awt.image.BufferedImage;
import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.stream.Stream;
import javax.imageio.ImageIO;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.test.web.servlet.MvcResult;

class MeIT extends IntegrationTest {

	@Autowired BlobStore blobs;

	Cookie cookie;

	@BeforeEach
	void setUp() throws Exception {
		accounts.create(new NewAccountRequest("admin@x.com", Sessions.PASSWORD, "boss", "Boss"), true);
		accounts.create(new NewAccountRequest("other@x.com", Sessions.PASSWORD, "taken", "Other"), false);
		cookie = Sessions.login(mvc, "admin@x.com");
	}

	private static String key(String url) {
		// /media/{id}/{variant}.jpg -> img/{id}/{variant}.jpg
		return "img" + url.substring("/media".length());
	}

	private String upload(byte[] data, String name) throws Exception {
		MvcResult r = mvc.perform(multipart("/api/me/avatar").file(new MockMultipartFile("file", name,
				"image/jpeg", data)).with(req -> {
					req.setMethod("PUT");
					return req;
				}).with(csrf()).cookie(cookie)).andReturn();
		return r.getResponse().getStatus() + "|" + r.getResponse().getContentAsString();
	}

	private static long blobCount() throws IOException {
		Path dir = Path.of("target/test-media/img");
		if (!Files.exists(dir)) {
			return 0;
		}
		try (Stream<Path> s = Files.list(dir)) {
			return s.count();
		}
	}

	@Test
	void renameTrimsDisplayName() throws Exception {
		mvc.perform(patch("/api/me").with(csrf()).cookie(cookie).contentType(MediaType.APPLICATION_JSON)
				.content("{\"displayName\":\"  New Name \"}"))
			.andExpect(status().isOk())
			.andExpect(jsonPath("$.displayName").value("New Name"))
			.andExpect(jsonPath("$.username").value("boss"));
		mvc.perform(get("/api/me").cookie(cookie)).andExpect(jsonPath("$.displayName").value("New Name"));
	}

	@Test
	void emptyPatchChangesNothingAndBadDisplayNameRejected() throws Exception {
		mvc.perform(patch("/api/me").with(csrf()).cookie(cookie).contentType(MediaType.APPLICATION_JSON)
				.content("{}"))
			.andExpect(status().isOk()).andExpect(jsonPath("$.displayName").value("Boss"));
		mvc.perform(patch("/api/me").with(csrf()).cookie(cookie).contentType(MediaType.APPLICATION_JSON)
				.content("{\"displayName\":\"   \"}"))
			.andExpect(status().isBadRequest()).andExpect(jsonPath("$.code").value("validation_failed"));
		mvc.perform(patch("/api/me").with(csrf()).cookie(cookie).contentType(MediaType.APPLICATION_JSON)
				.content("{\"displayName\":\"%s\"}".formatted("x".repeat(81))))
			.andExpect(status().isBadRequest());
	}

	@Test
	void changeUsername() throws Exception {
		mvc.perform(patch("/api/me").with(csrf()).cookie(cookie).contentType(MediaType.APPLICATION_JSON)
				.content("{\"username\":\"chef_1\"}"))
			.andExpect(status().isOk()).andExpect(jsonPath("$.username").value("chef_1"));
		mvc.perform(patch("/api/me").with(csrf()).cookie(cookie).contentType(MediaType.APPLICATION_JSON)
				.content("{\"username\":\"Chef_1\"}"))
			.andExpect(status().isBadRequest());
		mvc.perform(patch("/api/me").with(csrf()).cookie(cookie).contentType(MediaType.APPLICATION_JSON)
				.content("{\"username\":\"api\"}"))
			.andExpect(status().isBadRequest());
	}

	@Test
	@QuietSqlErrors
	void takenUsernameIs409() throws Exception {
		mvc.perform(patch("/api/me").with(csrf()).cookie(cookie).contentType(MediaType.APPLICATION_JSON)
				.content("{\"username\":\"taken\"}"))
			.andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("username_taken"));
		mvc.perform(get("/api/me").cookie(cookie)).andExpect(jsonPath("$.username").value("boss"));
	}

	@Test
	void changePasswordKeepsCurrentSessionAndDropsOthers() throws Exception {
		Cookie other = Sessions.login(mvc, "admin@x.com");
		mvc.perform(put("/api/me/password").with(csrf()).cookie(cookie).contentType(MediaType.APPLICATION_JSON)
				.content("{\"currentPassword\":\"wrong-password-1\",\"newPassword\":\"brand-new-pass-1\"}"))
			.andExpect(status().isBadRequest()).andExpect(jsonPath("$.code").value("bad_credentials"));
		mvc.perform(put("/api/me/password").with(csrf()).cookie(cookie).contentType(MediaType.APPLICATION_JSON)
				.content("{\"currentPassword\":\"%s\",\"newPassword\":\"short\"}".formatted(Sessions.PASSWORD)))
			.andExpect(status().isBadRequest()).andExpect(jsonPath("$.code").value("password_too_short"));
		mvc.perform(put("/api/me/password").with(csrf()).cookie(cookie).contentType(MediaType.APPLICATION_JSON)
				.content("{\"currentPassword\":\"%s\",\"newPassword\":\"brand-new-pass-1\"}"
					.formatted(Sessions.PASSWORD)))
			.andExpect(status().isNoContent());
		mvc.perform(get("/api/me").cookie(cookie)).andExpect(status().isOk());
		mvc.perform(get("/api/me").cookie(other)).andExpect(status().isUnauthorized());
		assertThat(Sessions.login(mvc, "admin@x.com", Sessions.PASSWORD)).isNull();
		assertThat(Sessions.login(mvc, "admin@x.com", "brand-new-pass-1")).isNotNull();
	}

	@Test
	void avatarUploadServesResizedJpegAndReplaceDeletesOld() throws Exception {
		String res = upload(TestImages.orientation6(), "me.jpg");
		assertThat(res).startsWith("200|");
		String url = json.readTree(res.substring(4)).get("avatarUrl").asText();
		assertThat(url).startsWith("/media/").endsWith("/avatar.jpg");
		byte[] served = mvc.perform(get(url)).andExpect(status().isOk()).andReturn().getResponse()
			.getContentAsByteArray();
		BufferedImage img = ImageIO.read(new ByteArrayInputStream(served));
		assertThat(Math.max(img.getWidth(), img.getHeight())).isEqualTo(256);
		mvc.perform(get("/api/me").cookie(cookie)).andExpect(jsonPath("$.avatarUrl").value(url));

		String oldKey = key(url);
		assertThat(blobs.get(oldKey)).isPresent();
		String res2 = upload(TestImages.png(300, 300), "me.png");
		assertThat(res2).startsWith("200|");
		String url2 = json.readTree(res2.substring(4)).get("avatarUrl").asText();
		assertThat(url2).isNotEqualTo(url);
		assertThat(blobs.get(oldKey)).isEmpty();
		assertThat(blobs.get(key(url2))).isPresent();
	}

	@Test
	void unsupportedUploadIs415AndLeavesNoBlob() throws Exception {
		String res = upload(TestImages.orientation6(), "me.jpg");
		String url = json.readTree(res.substring(4)).get("avatarUrl").asText();
		long before = blobCount();
		String bad = upload(TestImages.fakeJpgPdf(), "fake.jpg");
		assertThat(bad).startsWith("415|").contains("unsupported_image");
		assertThat(blobCount()).isEqualTo(before);
		assertThat(blobs.get(key(url))).isPresent();
		mvc.perform(get("/api/me").cookie(cookie)).andExpect(jsonPath("$.avatarUrl").value(url));
	}

	@Test
	void deleteAvatarClearsItAndRemovesBlob() throws Exception {
		String res = upload(TestImages.orientation6(), "me.jpg");
		String url = json.readTree(res.substring(4)).get("avatarUrl").asText();
		mvc.perform(delete("/api/me/avatar").with(csrf()).cookie(cookie))
			.andExpect(status().isOk()).andExpect(jsonPath("$.avatarUrl").doesNotExist());
		assertThat(blobs.get(key(url))).isEmpty();
		mvc.perform(delete("/api/me/avatar").with(csrf()).cookie(cookie))
			.andExpect(status().isOk()).andExpect(jsonPath("$.avatarUrl").doesNotExist());
	}

	@Test
	void meEndpointsRequireAuthentication() throws Exception {
		mvc.perform(patch("/api/me").with(csrf()).contentType(MediaType.APPLICATION_JSON).content("{}"))
			.andExpect(status().isUnauthorized());
		mvc.perform(put("/api/me/password").with(csrf()).contentType(MediaType.APPLICATION_JSON).content("{}"))
			.andExpect(status().isUnauthorized());
		mvc.perform(delete("/api/me/avatar").with(csrf())).andExpect(status().isUnauthorized());
	}
}

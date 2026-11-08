package com.ricettine.account;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.multipart;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.ricettine.IntegrationTest;
import com.ricettine.Sessions;
import com.ricettine.media.BlobStore;
import com.ricettine.media.TestImages;
import jakarta.servlet.http.Cookie;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.CopyOnWriteArrayList;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
import org.springframework.mock.web.MockMultipartFile;

@Import(AccountDeletionIT.Hooks.class)
class AccountDeletionIT extends IntegrationTest {

	static final List<UUID> called = new CopyOnWriteArrayList<>();

	@TestConfiguration
	static class Hooks {
		@Bean
		AccountDeletionHook recordingHook() {
			return called::add;
		}
	}

	@Autowired BlobStore blobs;

	@BeforeEach
	void clean() {
		called.clear();
	}

	private static String body(String pw) {
		return "{\"password\":\"%s\"}".formatted(pw);
	}

	@Test
	void wrongPasswordIs400() throws Exception {
		Cookie c = data.user("a@x.com", "alice", "Alice", false);
		mvc.perform(delete("/api/me").with(csrf()).cookie(c).contentType(MediaType.APPLICATION_JSON)
				.content(body("nope-nope-nope")))
			.andExpect(status().isBadRequest()).andExpect(jsonPath("$.code").value("bad_credentials"));
		assertThat(jdbc.queryForObject("select count(*) from app_user", Integer.class)).isEqualTo(1);
		assertThat(called).isEmpty();
	}

	@Test
	void deletesUserAvatarSessionsAndCallsHooks() throws Exception {
		data.account("admin@x.com", "boss", "Boss", true);
		User u = data.account("a@x.com", "alice", "Alice", false);
		Cookie c = Sessions.login(mvc, "a@x.com");
		Cookie c2 = Sessions.login(mvc, "a@x.com");
		String res = mvc.perform(multipart("/api/me/avatar")
				.file(new MockMultipartFile("file", "a.jpg", "image/jpeg", TestImages.orientation6()))
				.with(r -> {
					r.setMethod("PUT");
					return r;
				}).with(csrf()).cookie(c)).andReturn().getResponse().getContentAsString();
		String url = json.readTree(res).get("avatarUrl").asText();
		String key = "img" + url.substring("/media".length());
		assertThat(blobs.get(key)).isPresent();
		jdbc.update("insert into one_time_token (id, purpose, token_hash, user_id, expires_at, created_at) "
				+ "values (?, 'PASSWORD_RESET', repeat('a', 64), ?, now() + interval '1 day', now())",
				UUID.randomUUID(), u.getId());

		mvc.perform(delete("/api/me").with(csrf()).cookie(c).contentType(MediaType.APPLICATION_JSON)
				.content(body(Sessions.PASSWORD)))
			.andExpect(status().isNoContent());

		assertThat(jdbc.queryForObject("select count(*) from app_user where id = ?", Integer.class, u.getId()))
			.isZero();
		assertThat(jdbc.queryForObject("select count(*) from one_time_token", Integer.class)).isZero();
		assertThat(blobs.get(key)).isEmpty();
		assertThat(called).containsExactly(u.getId());
		mvc.perform(get("/api/me").cookie(c)).andExpect(status().isUnauthorized());
		mvc.perform(get("/api/me").cookie(c2)).andExpect(status().isUnauthorized());
		assertThat(jdbc.queryForObject("select count(*) from instance_setup", Integer.class)).isZero();
		mvc.perform(get("/api/setup/status")).andExpect(jsonPath("$.setupRequired").value(false));
	}

	@Test
	void deletesEveryMediaRowAndBlobTheUserOwns() throws Exception {
		data.account("admin@x.com", "boss", "Boss", true);
		User u = data.account("a@x.com", "alice", "Alice", false);
		Cookie c = Sessions.login(mvc, "a@x.com");
		mvc.perform(multipart("/api/me/avatar")
				.file(new MockMultipartFile("file", "a.jpg", "image/jpeg", TestImages.orientation6()))
				.with(r -> {
					r.setMethod("PUT");
					return r;
				}).with(csrf()).cookie(c)).andExpect(status().isOk());
		String avatarId = jdbc.queryForObject("select avatar_key from app_user where id = ?", String.class, u.getId());
		String recipeMediaId = "recipe-media-" + UUID.randomUUID();
		jdbc.update("insert into media (id, owner_id, kind, created_at) values (?, ?, 'RECIPE', now())",
				recipeMediaId, u.getId());
		List<String> keys = List.of("img/" + avatarId + "/avatar.jpg", "img/" + recipeMediaId + "/thumb.jpg",
				"img/" + recipeMediaId + "/display.jpg");
		blobs.put(keys.get(1), TestImages.plainJpeg(10, 10), "image/jpeg");
		blobs.put(keys.get(2), TestImages.plainJpeg(10, 10), "image/jpeg");
		keys.forEach(k -> assertThat(blobs.get(k)).as(k).isPresent());

		mvc.perform(delete("/api/me").with(csrf()).cookie(c).contentType(MediaType.APPLICATION_JSON)
				.content(body(Sessions.PASSWORD)))
			.andExpect(status().isNoContent());

		assertThat(jdbc.queryForObject("select count(*) from media where owner_id = ?", Integer.class, u.getId()))
			.isZero();
		keys.forEach(k -> assertThat(blobs.get(k)).as(k).isEmpty());
	}

	@Test
	void soleAdminWithOthersIs409() throws Exception {
		Cookie c = data.user("admin@x.com", "boss", "Boss", true);
		data.account("a@x.com", "alice", "Alice", false);
		mvc.perform(delete("/api/me").with(csrf()).cookie(c).contentType(MediaType.APPLICATION_JSON)
				.content(body(Sessions.PASSWORD)))
			.andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("last_admin"));
		assertThat(jdbc.queryForObject("select count(*) from app_user", Integer.class)).isEqualTo(2);
		assertThat(called).isEmpty();
		mvc.perform(get("/api/me").cookie(c)).andExpect(status().isOk());
	}

	@Test
	void adminCanDeleteWhenAnotherAdminExists() throws Exception {
		Cookie c = data.user("admin@x.com", "boss", "Boss", true);
		data.account("b@x.com", "boss2", "Boss2", true);
		mvc.perform(delete("/api/me").with(csrf()).cookie(c).contentType(MediaType.APPLICATION_JSON)
				.content(body(Sessions.PASSWORD)))
			.andExpect(status().isNoContent());
	}

	@Test
	void onlyUserCanDeleteAndInstanceReturnsToSetup() throws Exception {
		Cookie c = data.user("admin@x.com", "boss", "Boss", true);
		jdbc.update("insert into instance_setup (id, completed_at) values (1, now())");
		mvc.perform(delete("/api/me").with(csrf()).cookie(c).contentType(MediaType.APPLICATION_JSON)
				.content(body(Sessions.PASSWORD)))
			.andExpect(status().isNoContent());
		mvc.perform(get("/api/setup/status")).andExpect(jsonPath("$.setupRequired").value(true));
	}
}

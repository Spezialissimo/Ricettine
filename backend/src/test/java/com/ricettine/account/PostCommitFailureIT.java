package com.ricettine.account;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.doThrow;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.multipart;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.ricettine.IntegrationTest;
import com.ricettine.Sessions;
import com.ricettine.account.AccountDtos.NewAccountRequest;
import com.ricettine.media.BlobStore;
import com.ricettine.media.TestImages;
import jakarta.servlet.http.Cookie;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.test.context.bean.override.mockito.MockitoSpyBean;

/** Post-commit cleanup (blob deletion) failing must not undo or error a committed change. */
class PostCommitFailureIT extends IntegrationTest {

	@Autowired JdbcTemplate jdbc;
	@Autowired AccountService accounts;
	@MockitoSpyBean BlobStore blobs;

	@BeforeEach
	void clean() {
		jdbc.execute("truncate table app_user, one_time_token, instance_setup cascade");
		jdbc.execute("delete from spring_session");
	}

	private void upload(Cookie c, byte[] data, int expected) throws Exception {
		mvc.perform(multipart("/api/me/avatar").file(new MockMultipartFile("file", "a.jpg", "image/jpeg", data))
				.with(r -> {
					r.setMethod("PUT");
					return r;
				}).with(csrf()).cookie(c)).andExpect(status().is(expected));
	}

	@Test
	void deletionSucceedsAndSessionsDieEvenIfBlobDeleteThrows() throws Exception {
		accounts.create(new NewAccountRequest("admin@x.com", Sessions.PASSWORD, "boss", "Boss"), true);
		User u = accounts.create(new NewAccountRequest("b@x.com", Sessions.PASSWORD, "boss2", "Boss2"), true);
		Cookie c = Sessions.login(mvc, "b@x.com");
		Cookie c2 = Sessions.login(mvc, "b@x.com");
		upload(c, TestImages.orientation6(), 200);
		doThrow(new IllegalStateException("s3 down")).when(blobs).delete(anyString());

		mvc.perform(delete("/api/me").with(csrf()).cookie(c).contentType(MediaType.APPLICATION_JSON)
				.content("{\"password\":\"%s\"}".formatted(Sessions.PASSWORD)))
			.andExpect(status().isNoContent());

		assertThat(jdbc.queryForObject("select count(*) from app_user where id = ?", Integer.class, u.getId()))
			.isZero();
		mvc.perform(get("/api/me").cookie(c)).andExpect(status().isUnauthorized());
		mvc.perform(get("/api/me").cookie(c2)).andExpect(status().isUnauthorized());
	}

	@Test
	void avatarReplaceSucceedsEvenIfOldBlobDeleteThrows() throws Exception {
		accounts.create(new NewAccountRequest("a@x.com", Sessions.PASSWORD, "alice", "Alice"), true);
		Cookie c = Sessions.login(mvc, "a@x.com");
		upload(c, TestImages.orientation6(), 200);
		doThrow(new IllegalStateException("s3 down")).when(blobs).delete(anyString());
		mvc.perform(multipart("/api/me/avatar").file(new MockMultipartFile("file", "b.png", "image/png",
				TestImages.png(300, 300))).with(r -> {
					r.setMethod("PUT");
					return r;
				}).with(csrf()).cookie(c))
			.andExpect(status().isOk()).andExpect(jsonPath("$.avatarUrl").exists());
		String key = jdbc.queryForObject("select avatar_key from app_user", String.class);
		assertThat(blobs.get("img/" + key + "/avatar.jpg")).isPresent();
		mvc.perform(delete("/api/me/avatar").with(csrf()).cookie(c))
			.andExpect(status().isOk()).andExpect(jsonPath("$.avatarUrl").doesNotExist());
	}
}

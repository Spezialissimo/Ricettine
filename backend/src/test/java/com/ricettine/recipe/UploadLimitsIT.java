package com.ricettine.recipe;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.clearInvocations;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.multipart;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.ricettine.IntegrationTest;
import com.ricettine.media.BlobStore;
import com.ricettine.media.TestImages;
import jakarta.servlet.http.Cookie;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.test.context.bean.override.mockito.MockitoSpyBean;

class UploadLimitsIT extends IntegrationTest {

	@MockitoSpyBean BlobStore blobs;

	byte[] jpeg = TestImages.plainJpeg(1, 1);

	MockMultipartFile file() {
		return new MockMultipartFile("file", "p.jpg", "image/jpeg", jpeg);
	}

	@Test
	void uploadsLimitedPerUser() throws Exception {
		Cookie a = data.user("alice", true);
		Cookie b = data.user("bob", false);
		String recipe = data.draft(a);
		String cookbook = data.createCookbook(a, "Book");
		for (int i = 0; i < 40; i++) {
			mvc.perform(multipart("/api/recipes/" + recipe + "/photos").file(file()).with(csrf()).cookie(a))
				.andExpect(status().isCreated());
		}
		for (int i = 0; i < 10; i++) {
			mvc.perform(multipart("/api/cookbooks/" + cookbook + "/cover").file(file()).with(r -> {
				r.setMethod("PUT");
				return r;
			}).with(csrf()).cookie(a)).andExpect(status().isOk());
		}
		for (int i = 0; i < 10; i++) {
			mvc.perform(multipart("/api/me/avatar").file(file()).with(r -> {
				r.setMethod("PUT");
				return r;
			}).with(csrf()).cookie(a)).andExpect(status().isOk());
		}
		clearInvocations(blobs);
		mvc.perform(multipart("/api/recipes/" + recipe + "/photos").file(file()).with(csrf()).cookie(a))
			.andExpect(status().isTooManyRequests()).andExpect(jsonPath("$.code").value("too_many_attempts"))
			.andExpect(header().exists("Retry-After"));
		verify(blobs, never()).put(any(), any(), any());
		mvc.perform(multipart("/api/me/avatar").file(file()).with(r -> {
			r.setMethod("PUT");
			return r;
		}).with(csrf()).cookie(a)).andExpect(status().isTooManyRequests());
		String bobRecipe = data.draft(b);
		mvc.perform(multipart("/api/recipes/" + bobRecipe + "/photos").file(file()).with(csrf()).cookie(b))
			.andExpect(status().isCreated());
	}

	@Test
	void photoCapPerRecipe() throws Exception {
		Cookie a = data.user("alice", true);
		String recipe = data.draft(a);
		UUID owner = jdbc.queryForObject("select id from app_user", UUID.class);
		for (int i = 0; i < 150; i++) {
			jdbc.update("insert into media (id, owner_id, kind, recipe_id, created_at) "
					+ "values (?, ?, 'RECIPE', ?::uuid, now())", "m" + i + UUID.randomUUID(), owner, recipe);
		}
		clearInvocations(blobs);
		mvc.perform(multipart("/api/recipes/" + recipe + "/photos").file(file()).with(csrf()).cookie(a))
			.andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("too_many_photos"));
		verify(blobs, never()).put(any(), any(), any());
		assertThat(jdbc.queryForObject("select count(*) from media", Integer.class)).isEqualTo(150);
	}
}

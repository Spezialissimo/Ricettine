package com.ricettine.recipe;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.clearInvocations;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.multipart;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.ricettine.IntegrationTest;
import com.ricettine.Sessions;
import com.ricettine.account.AccountDtos.NewAccountRequest;
import com.ricettine.account.AccountService;
import com.ricettine.media.BlobStore;
import com.ricettine.media.TestImages;
import jakarta.servlet.http.Cookie;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.test.context.bean.override.mockito.MockitoSpyBean;
import tools.jackson.databind.ObjectMapper;

class UploadLimitsIT extends IntegrationTest {

	@Autowired JdbcTemplate jdbc;
	@Autowired AccountService accounts;
	@Autowired ObjectMapper json;
	@MockitoSpyBean BlobStore blobs;

	byte[] jpeg = TestImages.plainJpeg(1, 1);

	@BeforeEach
	void clean() {
		jdbc.execute("truncate table app_user, one_time_token, instance_setup cascade");
		jdbc.execute("delete from spring_session");
	}

	Cookie user(String tag, boolean admin) throws Exception {
		accounts.create(new NewAccountRequest(tag + "@x.com", Sessions.PASSWORD, tag, tag), admin);
		return Sessions.login(mvc, tag + "@x.com");
	}

	String create(String path, Cookie who) throws Exception {
		return json.readTree(mvc.perform(post(path).with(csrf()).cookie(who)).andExpect(status().isCreated())
			.andReturn().getResponse().getContentAsString()).get("id").asText();
	}

	MockMultipartFile file() {
		return new MockMultipartFile("file", "p.jpg", "image/jpeg", jpeg);
	}

	@Test
	void uploadsLimitedPerUser() throws Exception {
		Cookie a = user("alice", true);
		Cookie b = user("bob", false);
		String recipe = create("/api/recipes", a);
		String cookbook = json.readTree(mvc.perform(post("/api/cookbooks").with(csrf()).cookie(a)
			.contentType(MediaType.APPLICATION_JSON).content("{\"name\":\"Book\"}"))
			.andReturn().getResponse().getContentAsString()).get("id").asText();
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
		String bobRecipe = create("/api/recipes", b);
		mvc.perform(multipart("/api/recipes/" + bobRecipe + "/photos").file(file()).with(csrf()).cookie(b))
			.andExpect(status().isCreated());
	}

	@Test
	void photoCapPerRecipe() throws Exception {
		Cookie a = user("alice", true);
		String recipe = create("/api/recipes", a);
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

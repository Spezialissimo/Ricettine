package com.ricettine.recipe;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.multipart;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.ricettine.IntegrationTest;
import com.ricettine.Sessions;
import com.ricettine.account.AccountDtos.NewAccountRequest;
import com.ricettine.account.AccountService;
import com.ricettine.media.TestImages;
import jakarta.servlet.http.Cookie;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.test.web.servlet.MvcResult;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;

class PublicRecipeIT extends IntegrationTest {

	@Autowired JdbcTemplate jdbc;
	@Autowired AccountService accounts;
	@Autowired ObjectMapper json;
	@Autowired org.springframework.web.context.WebApplicationContext wac;

	Cookie me;
	Cookie other;

	@BeforeEach
	void setUp() throws Exception {
		jdbc.execute("truncate table app_user, one_time_token, instance_setup cascade");
		jdbc.execute("delete from spring_session");
		accounts.create(new NewAccountRequest("me@x.com", Sessions.PASSWORD, "mario", "Mario R"), true);
		accounts.create(new NewAccountRequest("other@x.com", Sessions.PASSWORD, "other1", "Other"), false);
		me = Sessions.login(mvc, "me@x.com");
		other = Sessions.login(mvc, "other@x.com");
	}

	JsonNode recipe(MvcResult r) throws Exception {
		return json.readTree(r.getResponse().getContentAsString());
	}

	String create(Cookie who) throws Exception {
		return recipe(mvc.perform(post("/api/recipes").with(csrf()).cookie(who)).andExpect(status().isCreated())
			.andReturn()).get("id").asText();
	}

	String uploadOk(Cookie who, String id) throws Exception {
		return recipe(mvc.perform(multipart("/api/recipes/" + id + "/photos")
			.file(new MockMultipartFile("file", "p.jpg", "image/jpeg", TestImages.plainJpeg(800, 600)))
			.with(csrf()).cookie(who)).andExpect(status().isCreated()).andReturn()).get("mediaId").asText();
	}

	void save(String id, long version, String visibility, String cover, String stepPhoto) throws Exception {
		mvc.perform(put("/api/recipes/" + id).with(csrf()).cookie(me).contentType(MediaType.APPLICATION_JSON)
			.content("""
				{"version":%d,"title":"Pasta","portions":2,"prepMinutes":5,"visibility":"%s","coverMediaId":%s,
				 "groups":[{"name":"","ingredients":[{"name":"flour","amount":1.5,"unit":"g"}]}],
				 "steps":[{"text":"mix","photoMediaId":%s}]}""".formatted(version, visibility,
					cover == null ? "null" : "\"" + cover + "\"", stepPhoto == null ? "null" : "\"" + stepPhoto + "\"")))
			.andExpect(status().isOk());
	}

	void publish(String id, long version) throws Exception {
		mvc.perform(post("/api/recipes/" + id + "/publish").with(csrf()).cookie(me)
			.contentType(MediaType.APPLICATION_JSON).content("{\"version\":" + version + "}"))
			.andExpect(status().isOk());
	}

	String token(String id) {
		return jdbc.queryForObject("select share_token from recipe where id = ?::uuid", String.class, id);
	}

	/** Published recipe with a cover and a step photo; returns its id. */
	String published(String visibility) throws Exception {
		String id = create(me);
		String cover = uploadOk(me, id);
		String step = uploadOk(me, id);
		save(id, 0, visibility, cover, step);
		publish(id, 1);
		return id;
	}

	@Test
	void anonymousReadsPublishedPrivateAndPublicRecipesByToken() throws Exception {
		for (String vis : new String[] { "PRIVATE", "PUBLIC" }) {
			String id = published(vis);
			String t = token(id);
			mvc.perform(get("/api/r/" + t)).andExpect(status().isOk())
				.andExpect(header().string("Cache-Control", "no-store"))
				.andExpect(jsonPath("$.title").value("Pasta"))
				.andExpect(jsonPath("$.portions").value(2))
				.andExpect(jsonPath("$.author.username").value("mario"))
				.andExpect(jsonPath("$.author.displayName").value("Mario R"))
				.andExpect(jsonPath("$.author.avatarUrl").doesNotExist())
				.andExpect(jsonPath("$.author.email").doesNotExist())
				.andExpect(jsonPath("$.author.id").doesNotExist())
				.andExpect(jsonPath("$.groups[0].ingredients[0].name").value("flour"))
				.andExpect(jsonPath("$.steps[0].text").value("mix"))
				.andExpect(jsonPath("$.steps[0].photo.thumbUrl").value(org.hamcrest.Matchers.endsWith("?s=" + t)))
				.andExpect(jsonPath("$.cover.displayUrl").value(org.hamcrest.Matchers.endsWith("?s=" + t)))
				.andExpect(jsonPath("$.publishedAt").isNotEmpty())
				.andExpect(jsonPath("$.viewerIsAuthor").value(false))
				.andExpect(jsonPath("$.id").doesNotExist())
				.andExpect(jsonPath("$.shareUrl").doesNotExist());
		}
	}

	@Test
	void unknownMalformedAndDraftTokensAre404() throws Exception {
		String draft = create(me);
		for (String t : new String[] { token(draft), "nope", "a".repeat(43), "x".repeat(2000), "a.b", "!!!" }) {
			mvc.perform(get("/api/r/" + t)).andExpect(status().isNotFound())
				.andExpect(header().string("Cache-Control", org.hamcrest.Matchers.containsString("no-store")))
				.andExpect(jsonPath("$.code").value("recipe_not_found"));
		}
	}

	@Test
	void anonymousRequestCreatesNoSession() throws Exception {
		String t = token(published("PRIVATE"));
		// csrf() in earlier requests leaves a session-backed CSRF repository in the shared filter chain
		// (test-support artifact); put the production cookie repository back before measuring.
		org.springframework.security.test.web.support.WebTestUtils.setCsrfTokenRepository(
				new org.springframework.mock.web.MockHttpServletRequest(wac.getServletContext()),
				org.springframework.security.web.csrf.CookieCsrfTokenRepository.withHttpOnlyFalse());
		int sessions = jdbc.queryForObject("select count(*) from spring_session", Integer.class);
		MvcResult r = mvc.perform(get("/api/r/" + t)).andExpect(status().isOk()).andReturn();
		assertThat(r.getResponse().getCookie("SESSION")).isNull();
		assertThat(jdbc.queryForObject("select count(*) from spring_session", Integer.class)).isEqualTo(sessions);
	}

	@Test
	void photosLoadAnonymouslyWithSAndNeverCacheable() throws Exception {
		String id = published("PRIVATE");
		JsonNode pub = recipe(mvc.perform(get("/api/r/" + token(id))).andReturn());
		String withS = pub.get("cover").get("displayUrl").asText();
		mvc.perform(get(withS)).andExpect(status().isOk())
			.andExpect(header().string("Cache-Control", "private, no-cache"));
		mvc.perform(get(withS.substring(0, withS.indexOf('?')))).andExpect(status().isNotFound());
	}

	@Test
	void viewerIsAuthorOnlyForTheAuthorsSession() throws Exception {
		String id = published("PRIVATE");
		String t2 = token(id);
		mvc.perform(get("/api/r/" + t2).cookie(me)).andExpect(jsonPath("$.viewerIsAuthor").value(true))
			.andExpect(jsonPath("$.recipeId").value(id));
		for (Cookie[] who : new Cookie[][] { { other }, {} }) {
			var req = get("/api/r/" + t2);
			if (who.length > 0) req = req.cookie(who[0]);
			String body = mvc.perform(req).andExpect(jsonPath("$.viewerIsAuthor").value(false)).andReturn()
				.getResponse().getContentAsString();
			assertThat(body).doesNotContain("recipeId").doesNotContain(id);
		}
	}

	@Test
	void shareUrlIsSetOnlyWhilePublished() throws Exception {
		String id = create(me);
		mvc.perform(get("/api/recipes/" + id).cookie(me)).andExpect(jsonPath("$.shareUrl").doesNotExist());
		save(id, 0, "PRIVATE", null, null);
		publish(id, 1);
		mvc.perform(get("/api/recipes/" + id).cookie(me))
			.andExpect(jsonPath("$.shareUrl").value("http://localhost/r/" + token(id)));
	}

	@Test
	void resetInvalidatesOldLinkAndPhotos() throws Exception {
		String id = published("PRIVATE");
		String oldToken = token(id);
		JsonNode before = recipe(mvc.perform(get("/api/r/" + oldToken)).andReturn());
		String oldPhoto = before.get("cover").get("thumbUrl").asText();
		mvc.perform(get(oldPhoto)).andExpect(status().isOk());

		long v = jdbc.queryForObject("select version from recipe where id = ?::uuid", Long.class, id);
		MvcResult res = mvc.perform(post("/api/recipes/" + id + "/share-link/reset").with(csrf()).cookie(me))
			.andExpect(status().isOk()).andExpect(jsonPath("$.version").value(v + 1)).andReturn();
		assertThat(jdbc.queryForObject("select version from recipe where id = ?::uuid", Long.class, id))
			.isEqualTo(v + 1);
		String newToken = token(id);
		assertThat(newToken).isNotEqualTo(oldToken);
		assertThat(recipe(res).get("shareUrl").asText()).endsWith("/r/" + newToken);

		mvc.perform(get("/api/r/" + oldToken)).andExpect(status().isNotFound());
		mvc.perform(get(oldPhoto)).andExpect(status().isNotFound());
		JsonNode after = recipe(mvc.perform(get("/api/r/" + newToken)).andExpect(status().isOk()).andReturn());
		mvc.perform(get(after.get("cover").get("thumbUrl").asText())).andExpect(status().isOk());
		mvc.perform(get(after.get("steps").get(0).get("photo").get("displayUrl").asText()))
			.andExpect(status().isOk());
		// the author's own photo URLs (no s) still work
		mvc.perform(get(recipe(res).get("cover").get("thumbUrl").asText()).cookie(me)).andExpect(status().isOk());
	}

	@Test
	void resetIsAuthorOnlyAndWorksOnDrafts() throws Exception {
		String id = create(me);
		String old = token(id);
		mvc.perform(post("/api/recipes/" + id + "/share-link/reset").with(csrf()).cookie(other))
			.andExpect(status().isNotFound()).andExpect(jsonPath("$.code").value("recipe_not_found"));
		mvc.perform(post("/api/recipes/" + id + "/share-link/reset").with(csrf()))
			.andExpect(status().isUnauthorized());
		assertThat(token(id)).isEqualTo(old);
		mvc.perform(post("/api/recipes/" + id + "/share-link/reset").with(csrf()).cookie(me))
			.andExpect(status().isOk()).andExpect(jsonPath("$.shareUrl").doesNotExist());
		assertThat(token(id)).isNotEqualTo(old);
	}
}

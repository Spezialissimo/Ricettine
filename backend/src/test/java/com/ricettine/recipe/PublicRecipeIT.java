package com.ricettine.recipe;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.ricettine.IntegrationTest;
import com.ricettine.testsupport.TestData.RecipeBody;
import jakarta.servlet.http.Cookie;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.security.web.csrf.CookieCsrfTokenRepository;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;
import tools.jackson.databind.JsonNode;

class PublicRecipeIT extends IntegrationTest {

	Cookie me;
	Cookie other;

	@BeforeEach
	void setUp() throws Exception {
		me = data.user("me@x.com", "mario", "Mario R", true);
		other = data.user("other@x.com", "other1", "Other", false);
	}

	long version(String id) {
		return jdbc.queryForObject("select version from recipe where id = ?::uuid", Long.class, id);
	}

	MockHttpServletRequestBuilder reset(String id, Cookie who, long v) {
		var req = post("/api/recipes/" + id + "/share-link/reset").with(csrf())
			.contentType(MediaType.APPLICATION_JSON).content("{\"version\":" + v + "}");
		return who == null ? req : req.cookie(who);
	}

	@Test
	void amountsKeepThreeDecimals() throws Exception {
		String id = data.draft(me);
		mvc.perform(put("/api/recipes/" + id).with(csrf()).cookie(me).contentType(MediaType.APPLICATION_JSON)
			.content("""
				{"version":0,"title":"Pasta","portions":3,"visibility":"PRIVATE",
				 "groups":[{"name":"","ingredients":[{"name":"milk","amount":0.333,"unit":"cup"}]}],
				 "steps":[{"text":"mix","photoMediaId":null}]}"""))
			.andExpect(status().isOk());
		data.publish(me, id, 1);
		mvc.perform(get("/api/r/" + data.recipeShareToken(id))).andExpect(status().isOk())
			.andExpect(jsonPath("$.portions").value(3))
			.andExpect(jsonPath("$.groups[0].ingredients[0].amount").value(0.333));
	}

	@Test
	void anonymousReadsPublishedPrivateAndPublicRecipesByToken() throws Exception {
		for (String vis : new String[] { "PRIVATE", "PUBLIC" }) {
			String id = data.publishedRecipeWithPhotos(me, vis);
			String t = data.recipeShareToken(id);
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
				.andExpect(jsonPath("$.cookbookName").doesNotExist())
				.andExpect(jsonPath("$.shareUrl").doesNotExist());
		}
	}

	@Test
	void unknownMalformedAndDraftTokensAre404() throws Exception {
		String draft = data.draft(me);
		for (String t : new String[] { data.recipeShareToken(draft), "nope", "a".repeat(43), "x".repeat(2000), "a.b", "!!!" }) {
			mvc.perform(get("/api/r/" + t)).andExpect(status().isNotFound())
				.andExpect(header().string("Cache-Control", org.hamcrest.Matchers.containsString("no-store")))
				.andExpect(jsonPath("$.code").value("recipe_not_found"));
		}
	}

	@Test
	void anonymousRequestCreatesNoSession() throws Exception {
		String t = data.recipeShareToken(data.publishedRecipeWithPhotos(me, "PRIVATE"));
		restoreCsrfRepository(); // the setup requests above used csrf(), which swaps the repository
		int sessions = jdbc.queryForObject("select count(*) from spring_session", Integer.class);
		MvcResult r = mvc.perform(get("/api/r/" + t)).andExpect(status().isOk()).andReturn();
		assertThat(r.getResponse().getCookie("SESSION")).isNull();
		// XSRF-TOKEN is set by design: csrf().spa() loads the token eagerly (no deferred token) so the SPA can
		// read it on any page and its first POST (e.g. "Log in" from this page's header) passes CSRF. It is a
		// stateless double-submit cookie (CookieCsrfTokenRepository): no server-side state, unlike SESSION.
		assertThat(r.getResponse().getCookie("XSRF-TOKEN")).isNotNull()
			.satisfies(c -> assertThat(c.isHttpOnly()).isFalse());
		assertThat(jdbc.queryForObject("select count(*) from spring_session", Integer.class)).isEqualTo(sessions);
	}

	@Test
	void photosLoadAnonymouslyWithSAndNeverCacheable() throws Exception {
		String id = data.publishedRecipeWithPhotos(me, "PRIVATE");
		JsonNode pub = data.read(mvc.perform(get("/api/r/" + data.recipeShareToken(id))).andReturn());
		String withS = pub.get("cover").get("displayUrl").asText();
		mvc.perform(get(withS)).andExpect(status().isOk())
			.andExpect(header().string("Cache-Control", "private, no-cache"));
		mvc.perform(get(withS.substring(0, withS.indexOf('?')))).andExpect(status().isNotFound());
	}

	@Test
	void viewerIsAuthorOnlyForTheAuthorsSession() throws Exception {
		String id = data.publishedRecipeWithPhotos(me, "PRIVATE");
		String t2 = data.recipeShareToken(id);
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
		String id = data.draft(me);
		mvc.perform(get("/api/recipes/" + id).cookie(me)).andExpect(jsonPath("$.shareUrl").doesNotExist());
		data.save(me, id, RecipeBody.of(0).visibility("PRIVATE").cover(null).stepPhoto(null));
		data.publish(me, id, 1);
		mvc.perform(get("/api/recipes/" + id).cookie(me))
			.andExpect(jsonPath("$.shareUrl").value("http://localhost/r/" + data.recipeShareToken(id)));
	}

	@Test
	void resetInvalidatesOldLinkAndPhotos() throws Exception {
		String id = data.publishedRecipeWithPhotos(me, "PRIVATE");
		String oldToken = data.recipeShareToken(id);
		JsonNode before = data.read(mvc.perform(get("/api/r/" + oldToken)).andReturn());
		String oldPhoto = before.get("cover").get("thumbUrl").asText();
		mvc.perform(get(oldPhoto)).andExpect(status().isOk());

		long v = version(id);
		MvcResult res = mvc.perform(reset(id, me, v))
			.andExpect(status().isOk()).andExpect(jsonPath("$.version").value(v + 1)).andReturn();
		assertThat(jdbc.queryForObject("select version from recipe where id = ?::uuid", Long.class, id))
			.isEqualTo(v + 1);
		String newToken = data.recipeShareToken(id);
		assertThat(newToken).isNotEqualTo(oldToken);
		assertThat(data.read(res).get("shareUrl").asText()).endsWith("/r/" + newToken);

		mvc.perform(get("/api/r/" + oldToken)).andExpect(status().isNotFound());
		mvc.perform(get(oldPhoto)).andExpect(status().isNotFound());
		JsonNode after = data.read(mvc.perform(get("/api/r/" + newToken)).andExpect(status().isOk()).andReturn());
		mvc.perform(get(after.get("cover").get("thumbUrl").asText())).andExpect(status().isOk());
		mvc.perform(get(after.get("steps").get(0).get("photo").get("displayUrl").asText()))
			.andExpect(status().isOk());
		// the author's own photo URLs (no s) still work
		mvc.perform(get(data.read(res).get("cover").get("thumbUrl").asText()).cookie(me)).andExpect(status().isOk());
	}

	@Test
	void resetIsAuthorOnlyAndWorksOnDrafts() throws Exception {
		String id = data.draft(me);
		String old = data.recipeShareToken(id);
		mvc.perform(reset(id, other, 0))
			.andExpect(status().isNotFound()).andExpect(jsonPath("$.code").value("recipe_not_found"));
		mvc.perform(reset(id, null, 0))
			.andExpect(status().isUnauthorized());
		assertThat(data.recipeShareToken(id)).isEqualTo(old);
		mvc.perform(reset(id, me, 0))
			.andExpect(status().isOk()).andExpect(jsonPath("$.shareUrl").doesNotExist());
		assertThat(data.recipeShareToken(id)).isNotEqualTo(old);
	}

	@Test
	void resetWithStaleVersionIs409AndChangesNothing() throws Exception {
		String id = data.publishedRecipeWithPhotos(me, "PRIVATE");
		String old = data.recipeShareToken(id);
		long v = version(id);
		mvc.perform(reset(id, me, v - 1)).andExpect(status().isConflict())
			.andExpect(jsonPath("$.code").value("recipe_conflict"));
		assertThat(data.recipeShareToken(id)).isEqualTo(old);
		assertThat(version(id)).isEqualTo(v);
		mvc.perform(get("/api/r/" + old)).andExpect(status().isOk());
	}

	@Test
	void resetWithoutVersionIs400() throws Exception {
		String id = data.publishedRecipeWithPhotos(me, "PRIVATE");
		String old = data.recipeShareToken(id);
		long v = version(id);
		mvc.perform(post("/api/recipes/" + id + "/share-link/reset").with(csrf()).cookie(me)
			.contentType(MediaType.APPLICATION_JSON).content("{}"))
			.andExpect(status().isBadRequest()).andExpect(jsonPath("$.code").value("validation_failed"))
			.andExpect(jsonPath("$.fields.version").value("required"));
		mvc.perform(post("/api/recipes/" + id + "/share-link/reset").with(csrf()).cookie(me))
			.andExpect(status().isBadRequest()).andExpect(jsonPath("$.code").value("validation_failed"))
			.andExpect(jsonPath("$.fields.version").value("required"));
		assertThat(data.recipeShareToken(id)).isEqualTo(old);
		assertThat(version(id)).isEqualTo(v);
	}
}

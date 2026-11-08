package com.ricettine.cookbook;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.multipart;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.ricettine.IntegrationTest;
import com.ricettine.media.TestImages;
import jakarta.servlet.http.Cookie;
import java.sql.Connection;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.TimeoutException;
import javax.sql.DataSource;
import org.junit.jupiter.api.Assertions;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.test.web.servlet.MvcResult;
import tools.jackson.databind.JsonNode;

class PublicCookbookIT extends IntegrationTest {

	@Autowired DataSource dataSource;

	Cookie me;     // recipe author
	Cookie other;  // cookbook owner

	@BeforeEach
	void setUp() throws Exception {
		me = data.user("me@x.com", "mario", "Mario R", true);
		other = data.user("other@x.com", "other1", "Other", false);
	}

	JsonNode read(MvcResult r) throws Exception {
		return json.readTree(r.getResponse().getContentAsString());
	}

	/** Published PRIVATE recipe of "me" with a cover and a step photo; returns its id. */
	String recipe() throws Exception {
		String id = read(mvc.perform(post("/api/recipes").with(csrf()).cookie(me)).andReturn()).get("id").asText();
		String cover = upload(id);
		String step = upload(id);
		mvc.perform(put("/api/recipes/" + id).with(csrf()).cookie(me).contentType(MediaType.APPLICATION_JSON)
			.content("""
				{"version":0,"title":"Pasta","portions":2,"visibility":"PRIVATE","coverMediaId":"%s",
				 "groups":[{"name":"","ingredients":[{"name":"flour"}]}],
				 "steps":[{"text":"mix","photoMediaId":"%s"}]}""".formatted(cover, step)))
			.andExpect(status().isOk());
		mvc.perform(post("/api/recipes/" + id + "/publish").with(csrf()).cookie(me)
			.contentType(MediaType.APPLICATION_JSON).content("{\"version\":1}")).andExpect(status().isOk());
		return id;
	}

	String upload(String id) throws Exception {
		return read(mvc.perform(multipart("/api/recipes/" + id + "/photos")
			.file(new MockMultipartFile("file", "p.jpg", "image/jpeg", TestImages.plainJpeg(800, 600)))
			.with(csrf()).cookie(me)).andExpect(status().isCreated()).andReturn()).get("mediaId").asText();
	}

	String recipeToken(String id) {
		return jdbc.queryForObject("select share_token from recipe where id = ?::uuid", String.class, id);
	}

	String cookbookToken(String id) {
		return jdbc.queryForObject("select share_token from cookbook where id = ?::uuid", String.class, id);
	}

	/** A cookbook owned by "other" (PRIVATE) containing the given recipes, added by their share tokens. */
	String cookbookWith(String... recipeIds) throws Exception {
		String cb = read(mvc.perform(post("/api/cookbooks").with(csrf()).cookie(other)
			.contentType(MediaType.APPLICATION_JSON).content("{\"name\":\"Dinners\"}"))
			.andExpect(status().isCreated()).andReturn()).get("id").asText();
		for (String r : recipeIds) {
			mvc.perform(post("/api/cookbooks/" + cb + "/recipes").with(csrf()).cookie(other)
				.contentType(MediaType.APPLICATION_JSON).content("{\"shareToken\":\"" + recipeToken(r) + "\"}"))
				.andExpect(status().isCreated());
		}
		return cb;
	}

	JsonNode viaCookbook(String token, String recipeId) throws Exception {
		return read(mvc.perform(get("/api/c/" + token + "/recipes/" + recipeId)).andExpect(status().isOk())
			.andReturn());
	}

	@Test
	void recipeThroughCookbookCarriesCookbookName() throws Exception {
		String r = recipe();
		String t = cookbookToken(cookbookWith(r));
		mvc.perform(get("/api/c/" + t + "/recipes/" + r)).andExpect(status().isOk())
			.andExpect(jsonPath("$.cookbookName").value("Dinners"));
	}

	@Test
	void anonymousReadsPrivateCookbookAndItsPrivateRecipeWithPhotos() throws Exception {
		String r = recipe();
		String cb = cookbookWith(r);
		String t = cookbookToken(cb);

		mvc.perform(get("/api/c/" + t)).andExpect(status().isOk())
			.andExpect(header().string("Cache-Control", "no-store"))
			.andExpect(jsonPath("$.name").value("Dinners"))
			.andExpect(jsonPath("$.owner.username").value("other1"))
			.andExpect(jsonPath("$.recipes[0].recipeId").value(r))
			.andExpect(jsonPath("$.recipes[0].title").value("Pasta"))
			.andExpect(jsonPath("$.recipes[0].author.username").value("mario"))
			.andExpect(jsonPath("$.recipes[0].coverThumbUrl").value(org.hamcrest.Matchers.endsWith("?c=" + t)))
			.andExpect(jsonPath("$.viewerRole").doesNotExist())
			.andExpect(jsonPath("$.cookbookId").doesNotExist());

		MvcResult res = mvc.perform(get("/api/c/" + t + "/recipes/" + r)).andExpect(status().isOk())
			.andExpect(header().string("Cache-Control", "no-store"))
			.andExpect(jsonPath("$.title").value("Pasta"))
			.andExpect(jsonPath("$.shareUrl").doesNotExist())
			.andExpect(jsonPath("$.recipeId").doesNotExist())
			.andExpect(jsonPath("$.steps[0].photo.displayUrl").value(org.hamcrest.Matchers.endsWith("?c=" + t)))
			.andReturn();
		assertThat(res.getResponse().getContentAsString()).doesNotContain(recipeToken(r));
		String photo = read(res).get("steps").get(0).get("photo").get("displayUrl").asText();
		mvc.perform(get(photo)).andExpect(status().isOk())
			.andExpect(header().string("Cache-Control", "private, no-cache"));
		mvc.perform(get(photo.substring(0, photo.indexOf('?')))).andExpect(status().isNotFound());
		mvc.perform(get(photo.replace("?c=" + t, "?c=nope"))).andExpect(status().isNotFound());

		mvc.perform(get("/api/c/unknown-token")).andExpect(status().isNotFound())
			.andExpect(jsonPath("$.code").value("cookbook_not_found"));
		mvc.perform(get("/api/c/unknown-token/recipes/" + r)).andExpect(status().isNotFound())
			.andExpect(jsonPath("$.code").value("cookbook_not_found"));
	}

	@Test
	void cookbookTokenOpensOnlyItsOwnRecipes() throws Exception {
		String in = recipe();
		String outside = recipe();
		String t = cookbookToken(cookbookWith(in));
		mvc.perform(get("/api/c/" + t + "/recipes/" + outside)).andExpect(status().isNotFound())
			.andExpect(jsonPath("$.code").value("recipe_not_found"));
		mvc.perform(get("/api/c/" + t + "/recipes/not-a-uuid")).andExpect(status().isNotFound())
			.andExpect(jsonPath("$.code").value("recipe_not_found"));
		String photo = read(mvc.perform(get("/api/r/" + recipeToken(outside))).andReturn()).get("cover")
			.get("thumbUrl").asText();
		mvc.perform(get(photo.substring(0, photo.indexOf('?')) + "?c=" + t)).andExpect(status().isNotFound());
	}

	@Test
	void removedEntryClosesAccess() throws Exception {
		String r = recipe();
		String cb = cookbookWith(r);
		String t = cookbookToken(cb);
		String photo = viaCookbook(t, r).get("cover").get("thumbUrl").asText();
		mvc.perform(get(photo)).andExpect(status().isOk());

		mvc.perform(delete("/api/cookbooks/" + cb + "/recipes/" + r).with(csrf()).cookie(other))
			.andExpect(status().isNoContent());
		mvc.perform(get("/api/c/" + t + "/recipes/" + r)).andExpect(status().isNotFound());
		mvc.perform(get(photo)).andExpect(status().isNotFound());
		mvc.perform(get("/api/c/" + t)).andExpect(jsonPath("$.recipes").isEmpty());
	}

	@Test
	void unpublishedRecipeIsHiddenThroughTheCookbook() throws Exception {
		String r = recipe();
		String t = cookbookToken(cookbookWith(r));
		String photo = viaCookbook(t, r).get("cover").get("thumbUrl").asText();
		jdbc.update("update recipe set status = 'DRAFT' where id = ?::uuid", r);
		mvc.perform(get("/api/c/" + t + "/recipes/" + r)).andExpect(status().isNotFound());
		mvc.perform(get(photo)).andExpect(status().isNotFound());
		mvc.perform(get("/api/c/" + t)).andExpect(jsonPath("$.recipes").isEmpty());
	}

	@Test
	void resetWaitsForTheCookbookRowLock() throws Exception {
		String cb = cookbookWith(recipe());
		String oldT = cookbookToken(cb);
		try (Connection holder = dataSource.getConnection()) {
			holder.setAutoCommit(false);
			try (var st = holder.prepareStatement("select id from cookbook where id = ?::uuid for update")) {
				st.setString(1, cb);
				st.executeQuery();
			}
			CompletableFuture<Void> reset = CompletableFuture.runAsync(() -> {
				try {
					mvc.perform(post("/api/cookbooks/" + cb + "/share-link/reset").with(csrf()).cookie(other))
						.andExpect(status().isOk());
				}
				catch (Exception e) {
					throw new IllegalStateException(e);
				}
			});
			// the reset queues behind the held row lock and has not touched the token
			Assertions.assertThrows(TimeoutException.class, () -> reset.get(1, TimeUnit.SECONDS));
			assertThat(cookbookToken(cb)).isEqualTo(oldT);
			holder.commit();
			reset.get(10, TimeUnit.SECONDS);
		}
		assertThat(cookbookToken(cb)).isNotEqualTo(oldT);
	}

	@Test
	void resetInvalidatesOldCookbookLinkAndPhotos() throws Exception {
		String r = recipe();
		String cb = cookbookWith(r);
		String oldT = cookbookToken(cb);
		String oldPhoto = viaCookbook(oldT, r).get("cover").get("thumbUrl").asText();
		mvc.perform(get(oldPhoto)).andExpect(status().isOk());

		JsonNode dto = read(mvc.perform(post("/api/cookbooks/" + cb + "/share-link/reset").with(csrf()).cookie(other))
			.andExpect(status().isOk()).andReturn());
		String newT = cookbookToken(cb);
		assertThat(newT).isNotEqualTo(oldT);
		assertThat(dto.get("shareUrl").asText()).isEqualTo("http://localhost/c/" + newT);
		assertThat(dto.get("recipes").get(0).get("coverThumbUrl").asText()).endsWith("?c=" + newT);

		mvc.perform(get("/api/c/" + oldT)).andExpect(status().isNotFound());
		mvc.perform(get("/api/c/" + oldT + "/recipes/" + r)).andExpect(status().isNotFound());
		mvc.perform(get(oldPhoto)).andExpect(status().isNotFound());
		JsonNode fresh = viaCookbook(newT, r);
		mvc.perform(get(fresh.get("cover").get("thumbUrl").asText())).andExpect(status().isOk());
		mvc.perform(get("/api/r/" + recipeToken(r))).andExpect(status().isOk());
	}

	@Test
	void recipeLinkResetKeepsCookbookAccess() throws Exception {
		String r = recipe();
		String t = cookbookToken(cookbookWith(r));
		mvc.perform(post("/api/recipes/" + r + "/share-link/reset").with(csrf()).cookie(me)
			.contentType(MediaType.APPLICATION_JSON).content("{\"version\":2}")).andExpect(status().isOk());
		JsonNode v = viaCookbook(t, r);
		mvc.perform(get(v.get("cover").get("thumbUrl").asText())).andExpect(status().isOk());
		mvc.perform(get("/api/c/" + t)).andExpect(jsonPath("$.recipes[0].recipeId").value(r));
	}

	@Test
	void viewerRoleAndCookbookIdOnlyForMembers() throws Exception {
		String r = recipe();
		String cb = cookbookWith(r);
		String t = cookbookToken(cb);
		mvc.perform(get("/api/c/" + t).cookie(other)).andExpect(jsonPath("$.viewerRole").value("OWNER"))
			.andExpect(jsonPath("$.cookbookId").value(cb));
		mvc.perform(get("/api/c/" + t).cookie(me)).andExpect(jsonPath("$.viewerRole").doesNotExist())
			.andExpect(jsonPath("$.cookbookId").doesNotExist());
		jdbc.update("insert into cookbook_author (cookbook_id, user_id, joined_at) "
			+ "select ?::uuid, id, now() from app_user where username = 'mario'", cb);
		mvc.perform(get("/api/c/" + t).cookie(me)).andExpect(jsonPath("$.viewerRole").value("AUTHOR"))
			.andExpect(jsonPath("$.cookbookId").value(cb));
		// the author is a member, but only the owner may reset
		mvc.perform(post("/api/cookbooks/" + cb + "/share-link/reset").with(csrf()).cookie(me))
			.andExpect(status().isForbidden()).andExpect(jsonPath("$.code").value("cookbook_owner_only"));
		assertThat(cookbookToken(cb)).isEqualTo(t);
	}

	@Test
	void publicEndpointsAreGetOnly() throws Exception {
		String t = cookbookToken(cookbookWith());
		mvc.perform(post("/api/c/" + t).with(csrf())).andExpect(status().isUnauthorized());
		mvc.perform(delete("/api/c/" + t).with(csrf())).andExpect(status().isUnauthorized());
	}
}

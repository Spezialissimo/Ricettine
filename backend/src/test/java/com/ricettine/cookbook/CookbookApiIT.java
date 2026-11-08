package com.ricettine.cookbook;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.ricettine.IntegrationTest;
import jakarta.servlet.http.Cookie;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.test.web.servlet.ResultActions;
import tools.jackson.databind.JsonNode;

class CookbookApiIT extends IntegrationTest {

	Cookie me;
	Cookie other;

	@BeforeEach
	void setUp() throws Exception {
		me = data.user("me@x.com", "mario", "Me", true);
		other = data.user("other@x.com", "other1", "Other", false);
	}

	ResultActions add(Cookie who, String cookbookId, String body) throws Exception {
		return mvc.perform(post("/api/cookbooks/" + cookbookId + "/recipes").with(csrf()).cookie(who)
			.contentType(MediaType.APPLICATION_JSON).content(body));
	}

	ResultActions addById(Cookie who, String cookbookId, String recipeId) throws Exception {
		return add(who, cookbookId, "{\"recipeId\":\"" + recipeId + "\"}");
	}

	ResultActions addByToken(Cookie who, String cookbookId, String token) throws Exception {
		return add(who, cookbookId, "{\"shareToken\":\"" + token + "\"}");
	}

	JsonNode fetch(Cookie who, String id) throws Exception {
		return data.read(mvc.perform(get("/api/cookbooks/" + id).cookie(who)).andExpect(status().isOk()).andReturn());
	}

	@Test
	void createAssignsIdOwnerAndPrivate() throws Exception {
		MvcResult r = mvc.perform(post("/api/cookbooks").with(csrf()).cookie(me).contentType(MediaType.APPLICATION_JSON)
			.content("{\"name\":\"  Dinners \",\"description\":\"  \"}")).andExpect(status().isCreated())
			.andExpect(jsonPath("$.name").value("Dinners")).andExpect(jsonPath("$.visibility").value("PRIVATE"))
			.andExpect(jsonPath("$.role").value("OWNER")).andExpect(jsonPath("$.description").doesNotExist())
			.andExpect(jsonPath("$.owner.username").value("mario")).andExpect(jsonPath("$.authors").isEmpty())
			.andExpect(jsonPath("$.recipes").isEmpty()).andExpect(jsonPath("$.shareUrl").value(org.hamcrest.Matchers.startsWith("http://localhost/c/")))
			.andExpect(jsonPath("$.cover").doesNotExist()).andReturn();
		JsonNode n = data.read(r);
		UUID id = UUID.fromString(n.get("id").asText());
		assertThat(r.getResponse().getHeader("Location")).isEqualTo("/api/cookbooks/" + id);
		assertThat(jdbc.queryForObject("select share_token from cookbook where id = ?", String.class, id)).hasSize(43);
		assertThat(fetch(me, id.toString()).get("name").asText()).isEqualTo("Dinners");
	}

	@Test
	void createValidatesInput() throws Exception {
		mvc.perform(post("/api/cookbooks").with(csrf()).cookie(me).contentType(MediaType.APPLICATION_JSON)
			.content("{\"name\":\" \",\"visibility\":\"SECRET\"}")).andExpect(status().isBadRequest())
			.andExpect(jsonPath("$.code").value("validation_failed"))
			.andExpect(jsonPath("$.fields.name").value("required"))
			.andExpect(jsonPath("$.fields.visibility").value("invalid"));
	}

	@Test
	void nonMemberGets404() throws Exception {
		String id = data.createCookbook(me);
		String recipe = data.publishedRecipe(other, "PUBLIC");
		mvc.perform(get("/api/cookbooks/" + id).cookie(other)).andExpect(status().isNotFound())
			.andExpect(jsonPath("$.code").value("cookbook_not_found"));
		mvc.perform(patch("/api/cookbooks/" + id).with(csrf()).cookie(other).contentType(MediaType.APPLICATION_JSON)
			.content("{\"name\":\"x\"}")).andExpect(status().isNotFound())
			.andExpect(jsonPath("$.code").value("cookbook_not_found"));
		mvc.perform(delete("/api/cookbooks/" + id).with(csrf()).cookie(other)).andExpect(status().isNotFound())
			.andExpect(jsonPath("$.code").value("cookbook_not_found"));
		addById(other, id, recipe).andExpect(status().isNotFound())
			.andExpect(jsonPath("$.code").value("cookbook_not_found"));
		mvc.perform(delete("/api/cookbooks/" + id + "/recipes/" + recipe).with(csrf()).cookie(other))
			.andExpect(status().isNotFound()).andExpect(jsonPath("$.code").value("cookbook_not_found"));
		mvc.perform(get("/api/cookbooks/" + UUID.randomUUID()).cookie(me)).andExpect(status().isNotFound());
		mvc.perform(get("/api/cookbooks/not-a-uuid").cookie(me)).andExpect(status().isNotFound())
			.andExpect(jsonPath("$.code").value("cookbook_not_found"));
		assertThat(fetch(me, id).get("name").asText()).isEqualTo("Dinners");
	}

	@Test
	void ownerPatchesAndDeletes() throws Exception {
		String id = data.createCookbook(me);
		Instant before = jdbc.queryForObject("select updated_at from cookbook where id = ?::uuid", Timestamp.class, id)
			.toInstant();
		mvc.perform(patch("/api/cookbooks/" + id).with(csrf()).cookie(me).contentType(MediaType.APPLICATION_JSON)
			.content("{\"description\":\" tasty \",\"visibility\":\"PUBLIC\"}")).andExpect(status().isOk())
			.andExpect(jsonPath("$.name").value("Dinners")).andExpect(jsonPath("$.description").value("tasty"))
			.andExpect(jsonPath("$.visibility").value("PUBLIC"));
		Instant after = jdbc.queryForObject("select updated_at from cookbook where id = ?::uuid", Timestamp.class, id)
			.toInstant();
		assertThat(after).isAfter(before);
		mvc.perform(patch("/api/cookbooks/" + id).with(csrf()).cookie(me).contentType(MediaType.APPLICATION_JSON)
			.content("{\"description\":\"\"}")).andExpect(status().isOk())
			.andExpect(jsonPath("$.description").doesNotExist());
		mvc.perform(patch("/api/cookbooks/" + id).with(csrf()).cookie(me).contentType(MediaType.APPLICATION_JSON)
			.content("{\"name\":\"\"}")).andExpect(status().isBadRequest())
			.andExpect(jsonPath("$.fields.name").value("required"));
		mvc.perform(delete("/api/cookbooks/" + id).with(csrf()).cookie(me)).andExpect(status().isNoContent());
		mvc.perform(get("/api/cookbooks/" + id).cookie(me)).andExpect(status().isNotFound());
	}

	@Test
	void authorIsMemberButNotOwner() throws Exception {
		String id = data.createCookbook(me);
		jdbc.update("insert into cookbook_author (cookbook_id, user_id, joined_at) "
				+ "select ?::uuid, id, now() from app_user where username = 'other1'", id);
		assertThat(fetch(other, id).get("role").asText()).isEqualTo("AUTHOR");
		assertThat(fetch(other, id).get("authors").get(0).get("username").asText()).isEqualTo("other1");
		mvc.perform(patch("/api/cookbooks/" + id).with(csrf()).cookie(other).contentType(MediaType.APPLICATION_JSON)
			.content("{\"name\":\"x\"}")).andExpect(status().isForbidden())
			.andExpect(jsonPath("$.code").value("cookbook_owner_only"));
		mvc.perform(delete("/api/cookbooks/" + id).with(csrf()).cookie(other)).andExpect(status().isForbidden())
			.andExpect(jsonPath("$.code").value("cookbook_owner_only"));
		String recipe = data.publishedRecipe(other, "PRIVATE");
		addById(other, id, recipe).andExpect(status().isCreated());
		mvc.perform(get("/api/cookbooks/mine").cookie(other)).andExpect(status().isOk())
			.andExpect(jsonPath("$[0].role").value("AUTHOR")).andExpect(jsonPath("$[0].recipeCount").value(1));
		mvc.perform(delete("/api/cookbooks/" + id + "/recipes/" + recipe).with(csrf()).cookie(other))
			.andExpect(status().isNoContent());
	}

	@Test
	void mineListsOwnedNewestFirst() throws Exception {
		String a = data.createCookbook(me);
		String b = data.createCookbookJson(me, "{\"name\":\"Desserts\"}").get("id").asText();
		data.createCookbook(other);
		String recipe = data.publishedRecipe(me, "PRIVATE");
		addById(me, a, recipe).andExpect(status().isCreated());
		JsonNode list = data.read(mvc.perform(get("/api/cookbooks/mine").cookie(me)).andExpect(status().isOk()).andReturn());
		assertThat(list).hasSize(2);
		// adding to A bumped it, so A is newest
		assertThat(list.get(0).get("id").asText()).isEqualTo(a);
		assertThat(list.get(0).get("recipeCount").asInt()).isEqualTo(1);
		assertThat(list.get(0).get("role").asText()).isEqualTo("OWNER");
		assertThat(list.get(1).get("id").asText()).isEqualTo(b);
		assertThat(list.get(1).get("recipeCount").asInt()).isZero();
		assertThat(list.get(0).get("visibility").asText()).isEqualTo("PRIVATE");
	}

	@Test
	void addOwnPublishedByIdAndOthersByToken() throws Exception {
		String id = data.createCookbook(me);
		String own = data.publishedRecipe(me, "PRIVATE");
		String theirs = data.publishedRecipe(other, "PRIVATE");
		addById(me, id, own).andExpect(status().isCreated()).andExpect(jsonPath("$.recipeId").value(own))
			.andExpect(jsonPath("$.title").value("R")).andExpect(jsonPath("$.mine").value(true))
			.andExpect(jsonPath("$.author.username").value("mario"))
			.andExpect(jsonPath("$.addedBy.username").value("mario"));
		addByToken(me, id, data.recipeShareToken(theirs)).andExpect(status().isCreated())
			.andExpect(jsonPath("$.recipeId").value(theirs))
			.andExpect(jsonPath("$.mine").value(false)).andExpect(jsonPath("$.author.username").value("other1"));
		addByToken(me, id, data.recipeShareToken(theirs)).andExpect(status().isOk())
			.andExpect(jsonPath("$.recipeId").value(theirs));
		addById(me, id, own).andExpect(status().isOk());
		assertThat(jdbc.queryForObject("select count(*) from cookbook_entry", Integer.class)).isEqualTo(2);
		jdbc.update("update cookbook_entry set added_at = added_at - interval '1 hour' where recipe_id = ?::uuid", own);
		JsonNode recipes = fetch(me, id).get("recipes");
		assertThat(recipes).hasSize(2);
		assertThat(recipes.get(0).get("recipeId").asText()).isEqualTo(theirs);
		assertThat(recipes.get(1).get("recipeId").asText()).isEqualTo(own);
		assertThat(recipes.get(0).get("addedBy").get("username").asText()).isEqualTo("mario");
		assertThat(recipes.get(0).get("title").asText()).isEqualTo("R");
	}

	@Test
	void addByIdRequiresAuthorOrPublic() throws Exception {
		String id = data.createCookbook(me);
		String privateTheirs = data.publishedRecipe(other, "PRIVATE");
		String publicTheirs = data.publishedRecipe(other, "PUBLIC");
		addById(me, id, privateTheirs).andExpect(status().isNotFound())
			.andExpect(jsonPath("$.code").value("recipe_not_found"));
		addById(me, id, publicTheirs).andExpect(status().isCreated());
		String myDraft = data.draft(me);
		String theirDraft = data.draft(other);
		addById(me, id, myDraft).andExpect(status().isNotFound())
			.andExpect(jsonPath("$.code").value("recipe_not_found"));
		addById(me, id, theirDraft).andExpect(status().isNotFound());
		String draftToken = data.recipeShareToken(theirDraft);
		addByToken(me, id, draftToken).andExpect(status().isNotFound())
			.andExpect(jsonPath("$.code").value("recipe_not_found"));
		addByToken(me, id, "nope").andExpect(status().isNotFound());
		addById(me, id, UUID.randomUUID().toString()).andExpect(status().isNotFound());
		add(me, id, "{\"recipeId\":\"" + publicTheirs + "\",\"shareToken\":\"x\"}")
			.andExpect(status().isBadRequest()).andExpect(jsonPath("$.code").value("validation_failed"));
		add(me, id, "{}").andExpect(status().isBadRequest())
			.andExpect(jsonPath("$.code").value("validation_failed"));
	}

	@Test
	void removeEntryIsIdempotent() throws Exception {
		String id = data.createCookbook(me);
		String recipe = data.publishedRecipe(me, "PRIVATE");
		addById(me, id, recipe).andExpect(status().isCreated());
		mvc.perform(delete("/api/cookbooks/" + id + "/recipes/" + recipe).with(csrf()).cookie(me))
			.andExpect(status().isNoContent());
		mvc.perform(delete("/api/cookbooks/" + id + "/recipes/" + recipe).with(csrf()).cookie(me))
			.andExpect(status().isNoContent());
		mvc.perform(delete("/api/cookbooks/" + id + "/recipes/not-a-uuid").with(csrf()).cookie(me))
			.andExpect(status().isNoContent());
		assertThat(fetch(me, id).get("recipes")).isEmpty();
	}

	@Test
	void cookbookFullAt500() throws Exception {
		String id = data.createCookbook(me);
		String first = data.publishedRecipe(me, "PRIVATE");
		String extra = data.publishedRecipe(me, "PRIVATE");
		// 499 entries (the key is cookbook + recipe, so bulk-insert real recipe rows), then one more fits, the next not.
		jdbc.update("""
			insert into recipe (id, author_id, status, visibility, title, portions, share_token, version, created_at, updated_at)
			select gen_random_uuid(), (select id from app_user where username = 'mario'), 'PUBLISHED', 'PRIVATE', 'bulk', 1,
			       'bulk-token-' || g, 0, now(), now()
			from generate_series(1, 498) g""");
		jdbc.update("""
			insert into cookbook_entry (cookbook_id, recipe_id, added_by, added_at)
			select ?::uuid, id, null, now() from recipe where title = 'bulk' or id = ?::uuid""", id, first);
		assertThat(jdbc.queryForObject("select count(*) from cookbook_entry", Integer.class)).isEqualTo(499);
		addById(me, id, extra).andExpect(status().isCreated());
		String third = data.publishedRecipe(me, "PRIVATE");
		addById(me, id, third).andExpect(status().isConflict())
			.andExpect(jsonPath("$.code").value("cookbook_full"));
		addById(me, id, extra).andExpect(status().isOk());
		assertThat(jdbc.queryForObject("select count(*) from cookbook_entry", Integer.class)).isEqualTo(500);
	}

	@Test
	void deletingRecipeRemovesItsEntries() throws Exception {
		String id = data.createCookbook(me);
		String recipe = data.publishedRecipe(me, "PRIVATE");
		addById(me, id, recipe).andExpect(status().isCreated());
		mvc.perform(delete("/api/recipes/" + recipe).with(csrf()).cookie(me)).andExpect(status().isNoContent());
		assertThat(fetch(me, id).get("recipes")).isEmpty();
		assertThat(jdbc.queryForObject("select count(*) from cookbook_entry", Integer.class)).isZero();
	}

	@Test
	void deletingCookbookKeepsRecipes() throws Exception {
		String id = data.createCookbook(me);
		String recipe = data.publishedRecipe(me, "PRIVATE");
		addById(me, id, recipe).andExpect(status().isCreated());
		mvc.perform(delete("/api/cookbooks/" + id).with(csrf()).cookie(me)).andExpect(status().isNoContent());
		assertThat(jdbc.queryForObject("select count(*) from recipe where id = ?::uuid", Integer.class, recipe))
			.isEqualTo(1);
		assertThat(jdbc.queryForObject("select count(*) from cookbook_entry", Integer.class)).isZero();
	}

	@Test
	void anonymousIs401() throws Exception {
		mvc.perform(get("/api/cookbooks/mine")).andExpect(status().isUnauthorized());
		mvc.perform(get("/api/cookbooks/" + UUID.randomUUID())).andExpect(status().isUnauthorized());
		mvc.perform(post("/api/cookbooks").with(csrf()).contentType(MediaType.APPLICATION_JSON)
			.content("{\"name\":\"x\"}")).andExpect(status().isUnauthorized());
	}
}

package com.ricettine.cookbook;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.ricettine.IntegrationTest;
import com.ricettine.Sessions;
import com.ricettine.account.AccountDtos.NewAccountRequest;
import com.ricettine.account.AccountService;
import jakarta.servlet.http.Cookie;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.test.web.servlet.ResultActions;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;

class CookbookApiIT extends IntegrationTest {

	@Autowired JdbcTemplate jdbc;
	@Autowired AccountService accounts;
	@Autowired ObjectMapper json;

	Cookie me;
	Cookie other;

	@BeforeEach
	void setUp() throws Exception {
		jdbc.execute("truncate table app_user, one_time_token, instance_setup cascade");
		jdbc.execute("delete from spring_session");
		accounts.create(new NewAccountRequest("me@x.com", Sessions.PASSWORD, "mario", "Me"), true);
		accounts.create(new NewAccountRequest("other@x.com", Sessions.PASSWORD, "other1", "Other"), false);
		me = Sessions.login(mvc, "me@x.com");
		other = Sessions.login(mvc, "other@x.com");
	}

	JsonNode read(MvcResult r) throws Exception {
		return json.readTree(r.getResponse().getContentAsString());
	}

	JsonNode createCookbook(Cookie who, String body) throws Exception {
		return read(mvc.perform(post("/api/cookbooks").with(csrf()).cookie(who).contentType(MediaType.APPLICATION_JSON)
			.content(body)).andExpect(status().isCreated()).andReturn());
	}

	String cookbook(Cookie who) throws Exception {
		return createCookbook(who, "{\"name\":\"Dinners\"}").get("id").asText();
	}

	/** A published recipe (title "R"), PRIVATE or PUBLIC; returns its JSON (id, shareUrl). */
	JsonNode publishedRecipe(Cookie who, String visibility) throws Exception {
		JsonNode draft = read(mvc.perform(post("/api/recipes").with(csrf()).cookie(who)).andReturn());
		String body = """
			{"version":0,"title":"R","portions":2,"visibility":"%s","groups":[
			 {"ingredients":[{"name":"flour"}]}],"steps":[{"text":"mix"}]}""".formatted(visibility);
		mvc.perform(put("/api/recipes/" + draft.get("id").asText()).with(csrf()).cookie(who)
			.contentType(MediaType.APPLICATION_JSON).content(body)).andExpect(status().isOk());
		return read(mvc.perform(post("/api/recipes/" + draft.get("id").asText() + "/publish").with(csrf()).cookie(who)
			.contentType(MediaType.APPLICATION_JSON).content("{\"version\":1}")).andExpect(status().isOk())
			.andReturn());
	}

	JsonNode draftRecipe(Cookie who) throws Exception {
		return read(mvc.perform(post("/api/recipes").with(csrf()).cookie(who)).andReturn());
	}

	static String tokenOf(JsonNode published) {
		String url = published.get("shareUrl").asText();
		return url.substring(url.lastIndexOf('/') + 1);
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
		return read(mvc.perform(get("/api/cookbooks/" + id).cookie(who)).andExpect(status().isOk()).andReturn());
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
		JsonNode n = read(r);
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
		String id = cookbook(me);
		String recipe = publishedRecipe(other, "PUBLIC").get("id").asText();
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
		String id = cookbook(me);
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
		String id = cookbook(me);
		jdbc.update("insert into cookbook_author (cookbook_id, user_id, joined_at) "
				+ "select ?::uuid, id, now() from app_user where username = 'other1'", id);
		assertThat(fetch(other, id).get("role").asText()).isEqualTo("AUTHOR");
		assertThat(fetch(other, id).get("authors").get(0).get("username").asText()).isEqualTo("other1");
		mvc.perform(patch("/api/cookbooks/" + id).with(csrf()).cookie(other).contentType(MediaType.APPLICATION_JSON)
			.content("{\"name\":\"x\"}")).andExpect(status().isForbidden())
			.andExpect(jsonPath("$.code").value("cookbook_owner_only"));
		mvc.perform(delete("/api/cookbooks/" + id).with(csrf()).cookie(other)).andExpect(status().isForbidden())
			.andExpect(jsonPath("$.code").value("cookbook_owner_only"));
		String recipe = publishedRecipe(other, "PRIVATE").get("id").asText();
		addById(other, id, recipe).andExpect(status().isCreated());
		mvc.perform(get("/api/cookbooks/mine").cookie(other)).andExpect(status().isOk())
			.andExpect(jsonPath("$[0].role").value("AUTHOR")).andExpect(jsonPath("$[0].recipeCount").value(1));
		mvc.perform(delete("/api/cookbooks/" + id + "/recipes/" + recipe).with(csrf()).cookie(other))
			.andExpect(status().isNoContent());
	}

	@Test
	void mineListsOwnedNewestFirst() throws Exception {
		String a = cookbook(me);
		String b = createCookbook(me, "{\"name\":\"Desserts\"}").get("id").asText();
		cookbook(other);
		String recipe = publishedRecipe(me, "PRIVATE").get("id").asText();
		addById(me, a, recipe).andExpect(status().isCreated());
		JsonNode list = read(mvc.perform(get("/api/cookbooks/mine").cookie(me)).andExpect(status().isOk()).andReturn());
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
		String id = cookbook(me);
		String own = publishedRecipe(me, "PRIVATE").get("id").asText();
		JsonNode theirs = publishedRecipe(other, "PRIVATE");
		addById(me, id, own).andExpect(status().isCreated()).andExpect(jsonPath("$.recipeId").value(own))
			.andExpect(jsonPath("$.title").value("R")).andExpect(jsonPath("$.mine").value(true))
			.andExpect(jsonPath("$.author.username").value("mario"))
			.andExpect(jsonPath("$.addedBy.username").value("mario"));
		addByToken(me, id, tokenOf(theirs)).andExpect(status().isCreated())
			.andExpect(jsonPath("$.recipeId").value(theirs.get("id").asText()))
			.andExpect(jsonPath("$.mine").value(false)).andExpect(jsonPath("$.author.username").value("other1"));
		addByToken(me, id, tokenOf(theirs)).andExpect(status().isOk())
			.andExpect(jsonPath("$.recipeId").value(theirs.get("id").asText()));
		addById(me, id, own).andExpect(status().isOk());
		assertThat(jdbc.queryForObject("select count(*) from cookbook_entry", Integer.class)).isEqualTo(2);
		jdbc.update("update cookbook_entry set added_at = added_at - interval '1 hour' where recipe_id = ?::uuid", own);
		JsonNode recipes = fetch(me, id).get("recipes");
		assertThat(recipes).hasSize(2);
		assertThat(recipes.get(0).get("recipeId").asText()).isEqualTo(theirs.get("id").asText());
		assertThat(recipes.get(1).get("recipeId").asText()).isEqualTo(own);
		assertThat(recipes.get(0).get("addedBy").get("username").asText()).isEqualTo("mario");
		assertThat(recipes.get(0).get("title").asText()).isEqualTo("R");
	}

	@Test
	void addByIdRequiresAuthorOrPublic() throws Exception {
		String id = cookbook(me);
		JsonNode privateTheirs = publishedRecipe(other, "PRIVATE");
		JsonNode publicTheirs = publishedRecipe(other, "PUBLIC");
		addById(me, id, privateTheirs.get("id").asText()).andExpect(status().isNotFound())
			.andExpect(jsonPath("$.code").value("recipe_not_found"));
		addById(me, id, publicTheirs.get("id").asText()).andExpect(status().isCreated());
		JsonNode myDraft = draftRecipe(me);
		JsonNode theirDraft = draftRecipe(other);
		addById(me, id, myDraft.get("id").asText()).andExpect(status().isNotFound())
			.andExpect(jsonPath("$.code").value("recipe_not_found"));
		addById(me, id, theirDraft.get("id").asText()).andExpect(status().isNotFound());
		String draftToken = jdbc.queryForObject("select share_token from recipe where id = ?::uuid", String.class,
				theirDraft.get("id").asText());
		addByToken(me, id, draftToken).andExpect(status().isNotFound())
			.andExpect(jsonPath("$.code").value("recipe_not_found"));
		addByToken(me, id, "nope").andExpect(status().isNotFound());
		addById(me, id, UUID.randomUUID().toString()).andExpect(status().isNotFound());
		add(me, id, "{\"recipeId\":\"" + publicTheirs.get("id").asText() + "\",\"shareToken\":\"x\"}")
			.andExpect(status().isBadRequest()).andExpect(jsonPath("$.code").value("validation_failed"));
		add(me, id, "{}").andExpect(status().isBadRequest())
			.andExpect(jsonPath("$.code").value("validation_failed"));
	}

	@Test
	void removeEntryIsIdempotent() throws Exception {
		String id = cookbook(me);
		String recipe = publishedRecipe(me, "PRIVATE").get("id").asText();
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
		String id = cookbook(me);
		String first = publishedRecipe(me, "PRIVATE").get("id").asText();
		String extra = publishedRecipe(me, "PRIVATE").get("id").asText();
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
		JsonNode third = publishedRecipe(me, "PRIVATE");
		addById(me, id, third.get("id").asText()).andExpect(status().isConflict())
			.andExpect(jsonPath("$.code").value("cookbook_full"));
		addById(me, id, extra).andExpect(status().isOk());
		assertThat(jdbc.queryForObject("select count(*) from cookbook_entry", Integer.class)).isEqualTo(500);
	}

	@Test
	void deletingRecipeRemovesItsEntries() throws Exception {
		String id = cookbook(me);
		String recipe = publishedRecipe(me, "PRIVATE").get("id").asText();
		addById(me, id, recipe).andExpect(status().isCreated());
		mvc.perform(delete("/api/recipes/" + recipe).with(csrf()).cookie(me)).andExpect(status().isNoContent());
		assertThat(fetch(me, id).get("recipes")).isEmpty();
		assertThat(jdbc.queryForObject("select count(*) from cookbook_entry", Integer.class)).isZero();
	}

	@Test
	void deletingCookbookKeepsRecipes() throws Exception {
		String id = cookbook(me);
		String recipe = publishedRecipe(me, "PRIVATE").get("id").asText();
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

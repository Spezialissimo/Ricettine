package com.ricettine.cookbook;

import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.ricettine.IntegrationTest;
import jakarta.servlet.http.Cookie;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.ResultActions;
import tools.jackson.databind.JsonNode;

/** Shared setup for the co-author ITs: owner "mario", users "bea" and "carl". */
abstract class CookbookIT extends IntegrationTest {

	Cookie owner;
	Cookie bea;
	Cookie carl;

	@BeforeEach
	void setUpUsers() throws Exception {
		owner = data.user("owner@x.com", "mario", "Mario", true);
		bea = data.user("bea@x.com", "bea1", "Bea", false);
		carl = data.user("carl@x.com", "carl1", "Carl", false);
	}

	UUID userId(String username) {
		return jdbc.queryForObject("select id from app_user where username = ?", UUID.class, username);
	}

	/** Creates an invite and returns {id, token}. */
	String[] invite(Cookie who, String cookbookId) throws Exception {
		JsonNode n = data.read(mvc.perform(post("/api/cookbooks/" + cookbookId + "/invites").with(csrf()).cookie(who))
			.andExpect(status().isCreated()).andReturn());
		String url = n.get("url").asText();
		return new String[] { n.get("id").asText(), url.substring(url.lastIndexOf('/') + 1) };
	}

	ResultActions accept(Cookie who, String token) throws Exception {
		return mvc.perform(post("/api/cookbook-invites/" + token + "/accept").with(csrf()).cookie(who));
	}

	ResultActions preview(Cookie who, String token) throws Exception {
		return mvc.perform(get("/api/cookbook-invites/" + token).cookie(who));
	}

	/** Invites and accepts in one go. */
	void join(String cookbookId, Cookie who) throws Exception {
		accept(who, invite(owner, cookbookId)[1]).andExpect(status().isOk());
	}

	ResultActions addRecipe(Cookie who, String cookbookId, String recipeId) throws Exception {
		return mvc.perform(post("/api/cookbooks/" + cookbookId + "/recipes").with(csrf()).cookie(who)
			.contentType(MediaType.APPLICATION_JSON).content("{\"recipeId\":\"" + recipeId + "\"}"));
	}

	ResultActions removeAuthor(Cookie who, String cookbookId, UUID userId, boolean removeRecipes) throws Exception {
		return mvc.perform(delete("/api/cookbooks/" + cookbookId + "/authors/" + userId + "?removeRecipes=" + removeRecipes)
			.with(csrf()).cookie(who));
	}
}

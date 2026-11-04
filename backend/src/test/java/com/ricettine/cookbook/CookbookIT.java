package com.ricettine.cookbook;

import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.ricettine.IntegrationTest;
import com.ricettine.Sessions;
import com.ricettine.account.AccountDtos.NewAccountRequest;
import com.ricettine.account.AccountService;
import jakarta.servlet.http.Cookie;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.test.web.servlet.ResultActions;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;

/** Shared setup for the co-author ITs: owner "mario", users "bea" and "carl". */
abstract class CookbookIT extends IntegrationTest {

	@Autowired JdbcTemplate jdbc;
	@Autowired AccountService accounts;
	@Autowired ObjectMapper json;

	Cookie owner;
	Cookie bea;
	Cookie carl;

	@BeforeEach
	void setUpUsers() throws Exception {
		jdbc.execute("truncate table app_user, one_time_token, instance_setup cascade");
		jdbc.execute("delete from spring_session");
		accounts.create(new NewAccountRequest("owner@x.com", Sessions.PASSWORD, "mario", "Mario"), true);
		accounts.create(new NewAccountRequest("bea@x.com", Sessions.PASSWORD, "bea1", "Bea"), false);
		accounts.create(new NewAccountRequest("carl@x.com", Sessions.PASSWORD, "carl1", "Carl"), false);
		owner = Sessions.login(mvc, "owner@x.com");
		bea = Sessions.login(mvc, "bea@x.com");
		carl = Sessions.login(mvc, "carl@x.com");
	}

	JsonNode read(MvcResult r) throws Exception {
		return json.readTree(r.getResponse().getContentAsString());
	}

	String cookbook(Cookie who) throws Exception {
		return read(mvc.perform(post("/api/cookbooks").with(csrf()).cookie(who).contentType(MediaType.APPLICATION_JSON)
			.content("{\"name\":\"Dinners\"}")).andExpect(status().isCreated()).andReturn()).get("id").asText();
	}

	UUID userId(String username) {
		return jdbc.queryForObject("select id from app_user where username = ?", UUID.class, username);
	}

	/** Creates an invite and returns {id, token}. */
	String[] invite(Cookie who, String cookbookId) throws Exception {
		JsonNode n = read(mvc.perform(post("/api/cookbooks/" + cookbookId + "/invites").with(csrf()).cookie(who))
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

	String publishedRecipe(Cookie who) throws Exception {
		JsonNode draft = read(mvc.perform(post("/api/recipes").with(csrf()).cookie(who)).andReturn());
		String id = draft.get("id").asText();
		String body = """
			{"version":0,"title":"R","portions":2,"visibility":"PRIVATE","groups":[
			 {"ingredients":[{"name":"flour"}]}],"steps":[{"text":"mix"}]}""";
		mvc.perform(put("/api/recipes/" + id).with(csrf()).cookie(who).contentType(MediaType.APPLICATION_JSON)
			.content(body)).andExpect(status().isOk());
		mvc.perform(post("/api/recipes/" + id + "/publish").with(csrf()).cookie(who)
			.contentType(MediaType.APPLICATION_JSON).content("{\"version\":1}")).andExpect(status().isOk());
		return id;
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

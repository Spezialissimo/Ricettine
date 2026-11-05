package com.ricettine.profile;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.multipart;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
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
import java.util.ArrayList;
import java.util.List;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpMethod;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.test.web.servlet.MvcResult;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;

class ProfileIT extends IntegrationTest {

	@Autowired JdbcTemplate jdbc;
	@Autowired AccountService accounts;
	@Autowired ObjectMapper json;

	Cookie a;
	Cookie b;
	String pubPublished;
	String privPublished;
	String pubDraft;
	String privDraft;
	String aPublicBook;
	String aPrivateBook;
	String bPublicBook;

	@BeforeEach
	void setUp() throws Exception {
		jdbc.execute("truncate table app_user, one_time_token, instance_setup cascade");
		jdbc.execute("delete from spring_session");
		accounts.create(new NewAccountRequest("a@x.com", Sessions.PASSWORD, "alice", "Alice A"), true);
		accounts.create(new NewAccountRequest("b@x.com", Sessions.PASSWORD, "bob", "Bob B"), false);
		a = Sessions.login(mvc, "a@x.com");
		b = Sessions.login(mvc, "b@x.com");

		pubPublished = recipe(a, "PUBLIC", true);
		privPublished = recipe(a, "PRIVATE", true);
		pubDraft = recipe(a, "PUBLIC", false);
		privDraft = recipe(a, "PRIVATE", false);
		aPublicBook = cookbook(a, "A public", "PUBLIC");
		aPrivateBook = cookbook(a, "A private", "PRIVATE");
		bPublicBook = cookbook(b, "B public", "PUBLIC");
		jdbc.update("insert into cookbook_author (cookbook_id, user_id, joined_at) "
				+ "select ?::uuid, id, now() from app_user where username = 'alice'", bPublicBook);
	}

	JsonNode tree(MvcResult r) throws Exception {
		return json.readTree(r.getResponse().getContentAsString());
	}

	String recipe(Cookie who, String visibility, boolean publish) throws Exception {
		String id = tree(mvc.perform(post("/api/recipes").with(csrf()).cookie(who)).andExpect(status().isCreated())
			.andReturn()).get("id").asText();
		String cover = tree(mvc.perform(multipart("/api/recipes/" + id + "/photos")
			.file(new MockMultipartFile("file", "p.jpg", "image/jpeg", TestImages.plainJpeg(800, 600)))
			.with(csrf()).cookie(who)).andExpect(status().isCreated()).andReturn()).get("mediaId").asText();
		mvc.perform(put("/api/recipes/" + id).with(csrf()).cookie(who).contentType(MediaType.APPLICATION_JSON)
			.content("""
				{"version":0,"title":"T-%s","portions":2,"visibility":"%s","coverMediaId":"%s",
				 "groups":[{"name":"","ingredients":[{"name":"flour","amount":1,"unit":"g"}]}],
				 "steps":[{"text":"mix","photoMediaId":null}]}""".formatted(id, visibility, cover)))
			.andExpect(status().isOk());
		if (publish) {
			mvc.perform(post("/api/recipes/" + id + "/publish").with(csrf()).cookie(who)
				.contentType(MediaType.APPLICATION_JSON).content("{\"version\":1}")).andExpect(status().isOk());
		}
		return id;
	}

	String cookbook(Cookie who, String name, String visibility) throws Exception {
		String id = tree(mvc.perform(post("/api/cookbooks").with(csrf()).cookie(who)
			.contentType(MediaType.APPLICATION_JSON)
			.content("{\"name\":\"" + name + "\",\"visibility\":\"" + visibility + "\"}"))
			.andExpect(status().isCreated()).andReturn()).get("id").asText();
		mvc.perform(multipart(HttpMethod.PUT, "/api/cookbooks/" + id + "/cover")
			.file(new MockMultipartFile("file", "p.jpg", "image/jpeg", TestImages.plainJpeg(800, 600)))
			.with(csrf()).cookie(who)).andExpect(status().isOk());
		return id;
	}

	JsonNode profile(Cookie who, String username) throws Exception {
		return tree(mvc.perform(get("/api/users/" + username + "/profile").cookie(who))
			.andExpect(status().isOk()).andExpect(header().string("Cache-Control", "no-store")).andReturn());
	}

	List<String> ids(JsonNode list) {
		List<String> out = new ArrayList<>();
		list.forEach(i -> out.add(i.get("id").asText()));
		return out;
	}

	@Test
	void visitorSeesOnlyPublic() throws Exception {
		JsonNode p = profile(b, "alice");
		assertThat(p.get("self").asBoolean()).isFalse();
		assertThat(p.get("person").get("username").asText()).isEqualTo("alice");
		assertThat(ids(p.get("recipes"))).containsExactly(pubPublished);
		assertThat(ids(p.get("cookbooks"))).containsExactly(aPublicBook);
		JsonNode r = p.get("recipes").get(0);
		assertThat(r.get("status").asText()).isEqualTo("PUBLISHED");
		assertThat(r.get("shareToken").asText()).isNotEmpty();
		assertThat(p.get("cookbooks").get(0).get("shareToken").asText()).isNotEmpty();
	}

	@Test
	void selfSeesAllMarked() throws Exception {
		JsonNode p = profile(a, "alice");
		assertThat(p.get("self").asBoolean()).isTrue();
		assertThat(ids(p.get("recipes"))).containsExactlyInAnyOrder(pubPublished, privPublished, pubDraft, privDraft);
		assertThat(ids(p.get("cookbooks"))).containsExactlyInAnyOrder(aPublicBook, aPrivateBook)
			.doesNotContain(bPublicBook);
		for (JsonNode r : p.get("recipes")) {
			String id = r.get("id").asText();
			boolean draft = id.equals(pubDraft) || id.equals(privDraft);
			assertThat(r.get("status").asText()).isEqualTo(draft ? "DRAFT" : "PUBLISHED");
			assertThat(r.get("visibility").asText())
				.isEqualTo(id.equals(pubPublished) || id.equals(pubDraft) ? "PUBLIC" : "PRIVATE");
			assertThat(r.get("shareToken").isNull()).isEqualTo(draft);
			assertThat(r.get("coverThumbUrl").asText()).contains(draft ? "" : "?s=");
			if (draft) {
				assertThat(r.get("coverThumbUrl").asText()).doesNotContain("?s=");
			}
		}
	}

	@Test
	void profileHidesPrivateAfterSwitch() throws Exception {
		assertThat(ids(profile(b, "alice").get("recipes"))).containsExactly(pubPublished);
		mvc.perform(patch("/api/cookbooks/" + aPublicBook).with(csrf()).cookie(a)
			.contentType(MediaType.APPLICATION_JSON).content("{\"visibility\":\"PRIVATE\"}"))
			.andExpect(status().isOk());
		long version = jdbc.queryForObject("select version from recipe where id = ?::uuid", Long.class, pubPublished);
		mvc.perform(put("/api/recipes/" + pubPublished).with(csrf()).cookie(a)
			.contentType(MediaType.APPLICATION_JSON).content("""
				{"version":%d,"title":"T","portions":2,"visibility":"PRIVATE",
				 "groups":[{"name":"","ingredients":[{"name":"flour","amount":1,"unit":"g"}]}],
				 "steps":[{"text":"mix","photoMediaId":null}]}""".formatted(version)))
			.andExpect(status().isOk());
		JsonNode p = profile(b, "alice");
		assertThat(p.get("recipes")).isEmpty();
		assertThat(p.get("cookbooks")).isEmpty();
	}

	@Test
	void thumbsLoadForVisitor() throws Exception {
		JsonNode p = profile(b, "alice");
		String recipeThumb = p.get("recipes").get(0).get("coverThumbUrl").asText();
		String bookThumb = p.get("cookbooks").get(0).get("coverThumbUrl").asText();
		assertThat(recipeThumb).contains("?s=");
		assertThat(bookThumb).contains("?c=");
		mvc.perform(get(recipeThumb)).andExpect(status().isOk());
		mvc.perform(get(bookThumb)).andExpect(status().isOk());
	}

	@Test
	void unknownUserIs404() throws Exception {
		mvc.perform(get("/api/users/nobody/profile").cookie(a)).andExpect(status().isNotFound())
			.andExpect(jsonPath("$.code").value("user_not_found"));
		mvc.perform(get("/api/users/Alice/profile").cookie(a)).andExpect(status().isNotFound())
			.andExpect(jsonPath("$.code").value("user_not_found"));
	}

	@Test
	void anonymousIs401() throws Exception {
		mvc.perform(get("/api/users/alice/profile")).andExpect(status().isUnauthorized());
	}
}

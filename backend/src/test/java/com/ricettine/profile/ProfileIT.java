package com.ricettine.profile;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.ricettine.IntegrationTest;
import com.ricettine.testsupport.TestData.RecipeBody;
import jakarta.servlet.http.Cookie;
import java.util.ArrayList;
import java.util.List;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MvcResult;
import tools.jackson.databind.JsonNode;

class ProfileIT extends IntegrationTest {

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
		a = data.user("a@x.com", "alice", "Alice A", true);
		b = data.user("b@x.com", "bob", "Bob B", false);

		pubPublished = recipe(a, "PUBLIC", true);
		privPublished = recipe(a, "PRIVATE", true);
		pubDraft = recipe(a, "PUBLIC", false);
		privDraft = recipe(a, "PRIVATE", false);
		aPublicBook = data.createCookbookWithCover(a, "A public", "PUBLIC");
		aPrivateBook = data.createCookbookWithCover(a, "A private", "PRIVATE");
		bPublicBook = data.createCookbookWithCover(b, "B public", "PUBLIC");
		jdbc.update("insert into cookbook_author (cookbook_id, user_id, joined_at) "
				+ "select ?::uuid, id, now() from app_user where username = 'alice'", bPublicBook);
	}

	/** A recipe with a cover photo, titled "T-{id}", PUBLIC or PRIVATE, published or left as a draft. */
	String recipe(Cookie who, String visibility, boolean publish) throws Exception {
		String id = data.draft(who);
		String cover = data.uploadPhoto(who, id);
		data.save(who, id, RecipeBody.of(0).title("T-" + id).visibility(visibility).cover(cover));
		if (publish) {
			data.publish(who, id, 1);
		}
		return id;
	}

	JsonNode tree(MvcResult r) throws Exception {
		return json.readTree(r.getResponse().getContentAsString());
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

	/** String-level guard: nothing private, draft or tokenised-private leaks through any field of the visitor view. */
	@Test
	void visitorProfileJsonContainsNoPrivateIdsOrTokens() throws Exception {
		String raw = mvc.perform(get("/api/users/alice/profile").cookie(b)).andExpect(status().isOk()).andReturn()
			.getResponse().getContentAsString();
		assertThat(raw).contains(pubPublished).contains(aPublicBook); // positive control
		assertThat(raw).doesNotContain(privPublished, pubDraft, privDraft, aPrivateBook)
			.doesNotContain(data.recipeShareToken(privPublished), data.recipeShareToken(pubDraft),
					data.recipeShareToken(privDraft), data.cookbookShareToken(aPrivateBook));
	}

	@Test
	void selfViewThumbsAreServed() throws Exception {
		JsonNode p = profile(a, "alice");
		assertThat(p.get("recipes")).hasSize(4);
		for (JsonNode r : p.get("recipes")) {
			mvc.perform(get(r.get("coverThumbUrl").asText()).cookie(a)).andExpect(status().isOk());
		}
		assertThat(p.get("cookbooks")).hasSize(2);
		for (JsonNode c : p.get("cookbooks")) {
			mvc.perform(get(c.get("coverThumbUrl").asText()).cookie(a)).andExpect(status().isOk());
		}
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
			if (draft) {
				assertThat(r.get("coverThumbUrl").asText()).doesNotContain("?s=");
			}
			else {
				assertThat(r.get("coverThumbUrl").asText()).contains("?s=");
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
		data.save(a, pubPublished, RecipeBody.of(version).title("T").visibility("PRIVATE"));
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

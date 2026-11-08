package com.ricettine.feed;

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
import com.ricettine.Sessions;
import com.ricettine.media.TestImages;
import jakarta.servlet.http.Cookie;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Set;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.test.web.servlet.MvcResult;
import tools.jackson.databind.JsonNode;

class FeedIT extends IntegrationTest {


	Cookie a;
	Cookie b;

	@BeforeEach
	void setUp() throws Exception {
		a = data.user("a@x.com", "alice", "Alice A", true);
		b = data.user("b@x.com", "bob", "Bob B", false);
	}

	JsonNode tree(MvcResult r) throws Exception {
		return json.readTree(r.getResponse().getContentAsString());
	}

	String create(Cookie who) throws Exception {
		return tree(mvc.perform(post("/api/recipes").with(csrf()).cookie(who)).andExpect(status().isCreated())
			.andReturn()).get("id").asText();
	}

	void save(Cookie who, String id, long version, String visibility, String cover) throws Exception {
		mvc.perform(put("/api/recipes/" + id).with(csrf()).cookie(who).contentType(MediaType.APPLICATION_JSON)
			.content("""
				{"version":%d,"title":"T-%s","portions":2,"visibility":"%s","coverMediaId":%s,
				 "groups":[{"name":"","ingredients":[{"name":"flour","amount":1,"unit":"g"}]}],
				 "steps":[{"text":"mix","photoMediaId":null}]}""".formatted(version, id, visibility,
					cover == null ? "null" : "\"" + cover + "\"")))
			.andExpect(status().isOk());
	}

	void publish(Cookie who, String id, long version) throws Exception {
		mvc.perform(post("/api/recipes/" + id + "/publish").with(csrf()).cookie(who)
			.contentType(MediaType.APPLICATION_JSON).content("{\"version\":" + version + "}"))
			.andExpect(status().isOk());
	}

	String cover(Cookie who, String id) throws Exception {
		return tree(mvc.perform(multipart("/api/recipes/" + id + "/photos")
			.file(new MockMultipartFile("file", "p.jpg", "image/jpeg", TestImages.plainJpeg(800, 600)))
			.with(csrf()).cookie(who)).andExpect(status().isCreated()).andReturn()).get("mediaId").asText();
	}

	/** A published recipe with the given visibility. */
	String published(Cookie who, String visibility) throws Exception {
		String id = create(who);
		save(who, id, 0, visibility, null);
		publish(who, id, 1);
		return id;
	}

	String draft(Cookie who, String visibility) throws Exception {
		String id = create(who);
		save(who, id, 0, visibility, null);
		return id;
	}

	void publishedAt(String id, String ts) {
		jdbc.update("update recipe set published_at = ?::timestamptz where id = ?::uuid", ts, id);
	}

	JsonNode feed(Cookie who, String query) throws Exception {
		return tree(mvc.perform(get("/api/feed" + query).cookie(who)).andExpect(status().isOk()).andReturn());
	}

	List<String> ids(JsonNode page) {
		List<String> out = new ArrayList<>();
		page.get("items").forEach(i -> out.add(i.get("id").asText()));
		return out;
	}

	/** Walks every page with the given limit, returning the ids of all items. */
	List<String> walk(Cookie who, int limit) throws Exception {
		List<String> all = new ArrayList<>();
		String cursor = null;
		for (int i = 0; i < 100; i++) {
			JsonNode p = feed(who, "?limit=" + limit + (cursor == null ? "" : "&cursor=" + cursor));
			all.addAll(ids(p));
			if (p.get("nextCursor").isNull()) {
				return all;
			}
			cursor = p.get("nextCursor").asText();
		}
		throw new AssertionError("feed did not terminate");
	}

	@Test
	void listsOnlyPublishedPublicNewestFirst() throws Exception {
		String older = published(a, "PUBLIC");
		String newer = published(b, "PUBLIC");
		String priv = published(a, "PRIVATE");
		String pubDraft = draft(a, "PUBLIC");
		String privDraft = draft(a, "PRIVATE");
		publishedAt(older, "2100-01-01T00:00:00Z");
		publishedAt(newer, "2100-01-02T00:00:00Z");

		JsonNode p = feed(a, "");
		assertThat(ids(p)).containsExactly(newer, older);
		assertThat(ids(p)).doesNotContain(priv, pubDraft, privDraft);
		JsonNode first = p.get("items").get(0);
		assertThat(first.get("author").get("username").asText()).isEqualTo("bob");
		assertThat(first.get("shareToken").asText()).isNotBlank();
		assertThat(first.get("title").asText()).isEqualTo("T-" + newer);
		assertThat(first.get("publishedAt").asText()).isNotBlank();
		assertThat(p.get("nextCursor").isNull()).isTrue();
	}

	@Test
	void publicDraftNeverListed() throws Exception {
		String d = draft(a, "PUBLIC");
		assertThat(walk(b, 50)).doesNotContain(d);
	}

	@Test
	void switchingToPrivateDelists() throws Exception {
		String id = published(a, "PUBLIC");
		assertThat(ids(feed(b, ""))).contains(id);
		long v = jdbc.queryForObject("select version from recipe where id = ?::uuid", Long.class, id);
		save(a, id, v, "PRIVATE", null);
		assertThat(ids(feed(b, ""))).doesNotContain(id);
		v = jdbc.queryForObject("select version from recipe where id = ?::uuid", Long.class, id);
		save(a, id, v, "PUBLIC", null);
		assertThat(ids(feed(b, ""))).contains(id);
	}

	@Test
	void paginatesWithCursor() throws Exception {
		List<String> mine = new ArrayList<>();
		for (int i = 0; i < 5; i++) {
			String id = published(a, "PUBLIC");
			publishedAt(id, "2100-01-0" + (i + 1) + "T00:00:00Z");
			mine.add(0, id); // newest first
		}
		JsonNode p1 = feed(b, "?limit=2");
		JsonNode p2 = feed(b, "?limit=2&cursor=" + p1.get("nextCursor").asText());
		JsonNode p3 = feed(b, "?limit=2&cursor=" + p2.get("nextCursor").asText());
		assertThat(ids(p1)).isEqualTo(mine.subList(0, 2));
		assertThat(ids(p2)).isEqualTo(mine.subList(2, 4));
		assertThat(ids(p3)).isEqualTo(mine.subList(4, 5));
		assertThat(p3.get("nextCursor").isNull()).isTrue();
		List<String> all = walk(b, 2);
		assertThat(all).doesNotHaveDuplicates().containsAll(mine);
	}

	@Test
	void tiesAreNeitherSkippedNorRepeated() throws Exception {
		List<String> tied = new ArrayList<>();
		for (int i = 0; i < 3; i++) {
			String id = published(a, "PUBLIC");
			publishedAt(id, "2100-06-01T00:00:00.123456Z");
			tied.add(id);
		}
		JsonNode p1 = feed(b, "?limit=2");
		// a recipe published between the two page loads lands before page 1's cursor
		String fresh = published(a, "PUBLIC");
		publishedAt(fresh, "2100-07-01T00:00:00Z");
		JsonNode p2 = feed(b, "?limit=2&cursor=" + p1.get("nextCursor").asText());
		List<String> seen = new ArrayList<>(ids(p1));
		seen.addAll(ids(p2));
		assertThat(ids(p2)).doesNotContain(fresh);
		assertThat(seen).doesNotHaveDuplicates().containsExactlyInAnyOrderElementsOf(tied);
		assertThat(p2.get("nextCursor").isNull()).isTrue();

		Set<String> all = new HashSet<>(walk(b, 2));
		assertThat(all).containsAll(tied).contains(fresh);
	}

	@Test
	void coverThumbLoadsWithItsToken() throws Exception {
		String id = create(a);
		String media = cover(a, id);
		save(a, id, 0, "PUBLIC", media);
		publish(a, id, 1);
		JsonNode item = feed(b, "").get("items").get(0);
		assertThat(item.get("id").asText()).isEqualTo(id);
		String url = item.get("coverThumbUrl").asText();
		assertThat(url).endsWith("?s=" + item.get("shareToken").asText());
		mvc.perform(get(url)).andExpect(status().isOk());
	}

	@Test
	void noCoverMeansNullThumb() throws Exception {
		published(a, "PUBLIC");
		assertThat(feed(b, "").get("items").get(0).get("coverThumbUrl").isNull()).isTrue();
	}

	@Test
	void badCursorOrLimit() throws Exception {
		mvc.perform(get("/api/feed?cursor=garbage").cookie(a)).andExpect(status().isBadRequest())
			.andExpect(jsonPath("$.code").value("validation_failed"))
			.andExpect(jsonPath("$.fields.cursor").value("invalid"));
		mvc.perform(get("/api/feed?limit=0").cookie(a)).andExpect(status().isBadRequest())
			.andExpect(jsonPath("$.fields.limit").value("invalid"));
		mvc.perform(get("/api/feed?limit=51").cookie(a)).andExpect(status().isBadRequest())
			.andExpect(jsonPath("$.fields.limit").value("invalid"));
		mvc.perform(get("/api/feed?limit=abc").cookie(a)).andExpect(status().isBadRequest())
			.andExpect(jsonPath("$.fields.limit").value("invalid"));
		mvc.perform(get("/api/feed?limit=50").cookie(a)).andExpect(status().isOk());
	}

	@Test
	void deletedAuthorsRecipesVanish() throws Exception {
		String id = published(b, "PUBLIC");
		assertThat(ids(feed(a, ""))).contains(id);
		mvc.perform(delete("/api/me").with(csrf()).cookie(b).contentType(MediaType.APPLICATION_JSON)
			.content("{\"password\":\"" + Sessions.PASSWORD + "\"}")).andExpect(status().isNoContent());
		assertThat(ids(feed(a, ""))).doesNotContain(id);
	}

	@Test
	void anonymousIs401AndResponseIsNoStore() throws Exception {
		mvc.perform(get("/api/feed")).andExpect(status().isUnauthorized());
		mvc.perform(get("/api/feed").cookie(a)).andExpect(status().isOk())
			.andExpect(header().string("Cache-Control", org.hamcrest.Matchers.containsString("no-store")));
	}
}

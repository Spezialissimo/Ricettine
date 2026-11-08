package com.ricettine.cookbook;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.multipart;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.ricettine.IntegrationTest;
import com.ricettine.media.BlobStore;
import com.ricettine.media.TestImages;
import jakarta.servlet.http.Cookie;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpMethod;
import org.springframework.http.MediaType;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.test.web.servlet.ResultActions;
import tools.jackson.databind.JsonNode;

class CookbookCoverIT extends IntegrationTest {

	@Autowired BlobStore blobs;

	Cookie owner;
	Cookie author;
	Cookie stranger;
	String cb;

	@BeforeEach
	void setUp() throws Exception {
		owner = data.user("me@x.com", "mario", "Mario", true);
		author = data.user("a@x.com", "author1", "Author", false);
		stranger = data.user("s@x.com", "stranger", "Stranger", false);
		cb = json.readTree(mvc.perform(post("/api/cookbooks").with(csrf()).cookie(owner)
			.contentType(MediaType.APPLICATION_JSON).content("{\"name\":\"Dinners\"}"))
			.andExpect(status().isCreated()).andReturn().getResponse().getContentAsString()).get("id").asText();
		jdbc.update("insert into cookbook_author (cookbook_id, user_id, joined_at) "
				+ "select ?::uuid, id, now() from app_user where username = 'author1'", cb);
	}

	ResultActions put(Cookie who, byte[] bytes) throws Exception {
		return mvc.perform(multipart(HttpMethod.PUT, "/api/cookbooks/" + cb + "/cover")
			.file(new MockMultipartFile("file", "p.jpg", "image/jpeg", bytes)).with(csrf()).cookie(who));
	}

	JsonNode setCover(Cookie who) throws Exception {
		return json.readTree(put(who, TestImages.plainJpeg(800, 600)).andExpect(status().isOk())
			.andReturn().getResponse().getContentAsString());
	}

	String token() {
		return jdbc.queryForObject("select share_token from cookbook where id = ?::uuid", String.class, cb);
	}

	boolean blobExists(String mediaId) {
		return blobs.get("img/" + mediaId + "/thumb.jpg").isPresent()
				|| blobs.get("img/" + mediaId + "/display.jpg").isPresent();
	}

	@Test
	void ownerUploadsAndReadersSeeIt() throws Exception {
		JsonNode dto = setCover(owner);
		String id = dto.get("cover").get("mediaId").asText();
		String thumb = dto.get("cover").get("thumbUrl").asText();
		String display = dto.get("cover").get("displayUrl").asText();
		assertThat(thumb).isEqualTo("/media/" + id + "/thumb.jpg");
		assertThat(display).isEqualTo("/media/" + id + "/display.jpg");
		assertThat(jdbc.queryForObject("select count(*) from media where id = ? and kind = 'COOKBOOK' "
				+ "and cookbook_id = ?::uuid", Integer.class, id, cb)).isEqualTo(1);
		for (String url : new String[] { thumb, display }) {
			for (Cookie member : new Cookie[] { owner, author }) {
				mvc.perform(get(url).cookie(member)).andExpect(status().isOk())
					.andExpect(header().string("Cache-Control", "private, no-cache"));
			}
			mvc.perform(get(url).cookie(stranger)).andExpect(status().isNotFound());
			mvc.perform(get(url)).andExpect(status().isNotFound());
			mvc.perform(get(url).param("c", "wrong")).andExpect(status().isNotFound());
			mvc.perform(get(url).param("c", token())).andExpect(status().isOk())
				.andExpect(header().string("Cache-Control", "private, no-cache"));
		}
		// member DTOs carry no token; the author sees the cover too
		mvc.perform(get("/api/cookbooks/" + cb).cookie(author)).andExpect(status().isOk())
			.andExpect(jsonPath("$.cover.thumbUrl").value(thumb));
		mvc.perform(get("/api/cookbooks/mine").cookie(owner))
			.andExpect(jsonPath("$[0].coverThumbUrl").value(thumb));
		// the public view carries ?c= on both URLs
		String q = "?c=" + URLEncoder.encode(token(), StandardCharsets.UTF_8);
		mvc.perform(get("/api/c/" + token()))
			.andExpect(jsonPath("$.cover.thumbUrl").value(thumb + q))
			.andExpect(jsonPath("$.cover.displayUrl").value(display + q));
	}

	@Test
	void resetLinkRevokesTheOldToken() throws Exception {
		String thumb = setCover(owner).get("cover").get("thumbUrl").asText();
		String old = token();
		mvc.perform(get(thumb).param("c", old)).andExpect(status().isOk());
		mvc.perform(post("/api/cookbooks/" + cb + "/share-link/reset").with(csrf()).cookie(owner))
			.andExpect(status().isOk());
		mvc.perform(get(thumb).param("c", old)).andExpect(status().isNotFound());
		mvc.perform(get(thumb).param("c", token())).andExpect(status().isOk());
	}

	@Test
	void tokenOfAnotherCookbookDoesNotOpenTheCover() throws Exception {
		String thumb = setCover(owner).get("cover").get("thumbUrl").asText();
		String otherCb = json.readTree(mvc.perform(post("/api/cookbooks").with(csrf()).cookie(owner)
			.contentType(MediaType.APPLICATION_JSON).content("{\"name\":\"Other\"}"))
			.andReturn().getResponse().getContentAsString()).get("id").asText();
		String otherToken = jdbc.queryForObject("select share_token from cookbook where id = ?::uuid", String.class,
				otherCb);
		mvc.perform(get(thumb).param("c", otherToken)).andExpect(status().isNotFound());
	}

	@Test
	void authorAndStrangerCannotUpload() throws Exception {
		put(author, TestImages.plainJpeg(100, 100)).andExpect(status().isForbidden())
			.andExpect(jsonPath("$.code").value("cookbook_owner_only"));
		put(stranger, TestImages.plainJpeg(100, 100)).andExpect(status().isNotFound())
			.andExpect(jsonPath("$.code").value("cookbook_not_found"));
		mvc.perform(delete("/api/cookbooks/" + cb + "/cover").with(csrf()).cookie(author))
			.andExpect(status().isForbidden());
		assertThat(jdbc.queryForObject("select count(*) from media", Integer.class)).isZero();
	}

	@Test
	void replacingDeletesTheOldCoverAndRemoveClearsIt() throws Exception {
		String first = setCover(owner).get("cover").get("mediaId").asText();
		assertThat(blobExists(first)).isTrue();
		String second = setCover(owner).get("cover").get("mediaId").asText();
		assertThat(second).isNotEqualTo(first);
		assertThat(blobExists(first)).isFalse();
		assertThat(blobExists(second)).isTrue();
		assertThat(jdbc.queryForObject("select count(*) from media", Integer.class)).isEqualTo(1);
		mvc.perform(delete("/api/cookbooks/" + cb + "/cover").with(csrf()).cookie(owner))
			.andExpect(status().isOk()).andExpect(jsonPath("$.cover").doesNotExist());
		assertThat(blobExists(second)).isFalse();
		assertThat(jdbc.queryForObject("select count(*) from media", Integer.class)).isZero();
		// idempotent
		mvc.perform(delete("/api/cookbooks/" + cb + "/cover").with(csrf()).cookie(owner))
			.andExpect(status().isOk());
	}

	@Test
	void deletingTheCookbookDeletesTheCover() throws Exception {
		String id = setCover(owner).get("cover").get("mediaId").asText();
		mvc.perform(delete("/api/cookbooks/" + cb).with(csrf()).cookie(owner)).andExpect(status().isNoContent());
		assertThat(blobExists(id)).isFalse();
		assertThat(jdbc.queryForObject("select count(*) from media", Integer.class)).isZero();
	}

	@Test
	void disguisedPdfIs415AndKeepsTheOldCover() throws Exception {
		String id = setCover(owner).get("cover").get("mediaId").asText();
		put(owner, TestImages.fakeJpgPdf()).andExpect(status().isUnsupportedMediaType())
			.andExpect(jsonPath("$.code").value("unsupported_image"));
		assertThat(blobExists(id)).isTrue();
		assertThat(jdbc.queryForObject("select count(*) from media", Integer.class)).isEqualTo(1);
	}

	@Test
	void removedCoAuthorLosesTheCoverAtOnce() throws Exception {
		String thumb = setCover(owner).get("cover").get("thumbUrl").asText();
		String etag = mvc.perform(get(thumb).cookie(author)).andExpect(status().isOk())
			.andExpect(header().string("Cache-Control", "private, no-cache")).andReturn().getResponse()
			.getHeader("ETag");
		mvc.perform(get(thumb).cookie(author).header("If-None-Match", etag)).andExpect(status().isNotModified());
		jdbc.update("delete from cookbook_author where cookbook_id = ?::uuid", cb);
		mvc.perform(get(thumb).cookie(author).header("If-None-Match", etag)).andExpect(status().isNotFound());
		mvc.perform(get(thumb).cookie(author)).andExpect(status().isNotFound());
	}
}

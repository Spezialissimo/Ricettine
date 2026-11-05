package com.ricettine.media;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.multipart;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.ricettine.IntegrationTest;
import com.ricettine.Sessions;
import com.ricettine.account.AccountDtos.NewAccountRequest;
import com.ricettine.account.AccountService;
import com.ricettine.account.User;
import com.ricettine.Sessions;
import jakarta.servlet.http.Cookie;
import org.springframework.http.MediaType;
import org.springframework.mock.web.MockMultipartFile;
import tools.jackson.databind.ObjectMapper;
import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.ResultSet;
import java.sql.Statement;
import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;
import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;

class MediaAccessIT extends IntegrationTest {

	@Autowired JdbcTemplate jdbc;
	@Autowired AccountService accounts;
	@Autowired MediaService media;
	@Autowired BlobStore blobs;
	@Autowired ObjectMapper json;

	User owner;

	@BeforeEach
	void setUp() {
		jdbc.execute("truncate table app_user, one_time_token, instance_setup cascade");
		owner = accounts.create(new NewAccountRequest("o@x.com", Sessions.PASSWORD, "owner", "Owner"), true);
	}

	@Test
	void avatarIsServedAnonymouslyWithImmutableHeaderAndHasARow() throws Exception {
		String id = media.register(media.process(TestImages.orientation6(), Set.of(ImageVariant.AVATAR)), owner.getId(), MediaKind.AVATAR, null);
		assertThat(jdbc.queryForObject("select kind from media where id = ? and owner_id = ?", String.class, id,
				owner.getId())).isEqualTo("AVATAR");
		mvc.perform(get(media.url(id, ImageVariant.AVATAR))).andExpect(status().isOk())
				.andExpect(header().string("Cache-Control", "public, max-age=31536000, immutable"));
	}

	/** RECIPE media: the owner gets it privately cached; another user and an anonymous caller get 404. */
	@Test
	void recipeMediaIsOwnerOnly() throws Exception {
		accounts.create(new NewAccountRequest("x@x.com", Sessions.PASSWORD, "xother", "X"), false);
		String id = media.register(media.process(TestImages.orientation6(), Set.of(ImageVariant.THUMB)), owner.getId(), MediaKind.RECIPE, null);
		var ownerCookie = Sessions.login(mvc, "o@x.com");
		mvc.perform(get(media.url(id, ImageVariant.THUMB)).cookie(ownerCookie)).andExpect(status().isOk())
				.andExpect(header().string("Cache-Control", "private, max-age=3600"));
		var otherCookie = Sessions.login(mvc, "x@x.com");
		mvc.perform(get(media.url(id, ImageVariant.THUMB)).cookie(otherCookie)).andExpect(status().isNotFound());
		mvc.perform(get(media.url(id, ImageVariant.THUMB))).andExpect(status().isNotFound());
		mvc.perform(get(media.url(id, ImageVariant.THUMB)).param("s", "anything")).andExpect(status().isNotFound());
	}

	/** Published recipe of the owner with one cover photo; returns {recipeId, mediaId}. */
	String[] publishedRecipeWithPhoto(Cookie who) throws Exception {
		String id = json.readTree(mvc.perform(post("/api/recipes").with(csrf()).cookie(who)).andReturn().getResponse()
				.getContentAsString()).get("id").asText();
		String mediaId = uploadPhoto(who, id);
		mvc.perform(put("/api/recipes/" + id).with(csrf()).cookie(who).contentType(MediaType.APPLICATION_JSON)
				.content("""
						{"version":0,"title":"Pasta","portions":2,"visibility":"PRIVATE","coverMediaId":"%s",
						 "groups":[{"name":"","ingredients":[{"name":"flour"}]}],
						 "steps":[{"text":"mix","photoMediaId":null}]}""".formatted(mediaId)))
				.andExpect(status().isOk());
		mvc.perform(post("/api/recipes/" + id + "/publish").with(csrf()).cookie(who)
				.contentType(MediaType.APPLICATION_JSON).content("{\"version\":1}")).andExpect(status().isOk());
		return new String[] { id, mediaId };
	}

	String uploadPhoto(Cookie who, String recipeId) throws Exception {
		return json.readTree(mvc.perform(multipart("/api/recipes/" + recipeId + "/photos")
				.file(new MockMultipartFile("file", "p.jpg", "image/jpeg", TestImages.plainJpeg(800, 600)))
				.with(csrf()).cookie(who)).andExpect(status().isCreated()).andReturn().getResponse()
				.getContentAsString()).get("mediaId").asText();
	}

	String shareToken(String recipeId) {
		return jdbc.queryForObject("select share_token from recipe where id = ?::uuid", String.class, recipeId);
	}

	@Test
	void etagAndNotModified() throws Exception {
		var cookie = Sessions.login(mvc, "o@x.com");
		String[] r = publishedRecipeWithPhoto(cookie);
		String url = media.url(r[1], ImageVariant.THUMB);
		String etag = mvc.perform(get(url).param("s", shareToken(r[0]))).andExpect(status().isOk())
				.andExpect(header().string("Cache-Control", "private, no-cache"))
				.andReturn().getResponse().getHeader("ETag");
		assertThat(etag).isEqualTo("\"" + r[1] + ".thumb\"");
		// the blob is gone: a 304 proves it was not loaded, while a 200 would now be a 404
		blobs.delete(MediaService.key(r[1], ImageVariant.THUMB));
		mvc.perform(get(url).param("s", shareToken(r[0])).header("If-None-Match", etag))
				.andExpect(status().isNotModified()).andExpect(header().string("ETag", etag))
				.andExpect(header().string("Cache-Control", "private, no-cache"))
				.andExpect(org.springframework.test.web.servlet.result.MockMvcResultMatchers.content().bytes(new byte[0]));
		mvc.perform(get(url).param("s", shareToken(r[0]))).andExpect(status().isNotFound());
	}

	@Test
	void notModifiedStillChecksAccess() throws Exception {
		var cookie = Sessions.login(mvc, "o@x.com");
		String[] r = publishedRecipeWithPhoto(cookie);
		String url = media.url(r[1], ImageVariant.THUMB);
		String oldToken = shareToken(r[0]);
		String etag = mvc.perform(get(url).param("s", oldToken)).andExpect(status().isOk()).andReturn().getResponse()
				.getHeader("ETag");
		mvc.perform(post("/api/recipes/" + r[0] + "/share-link/reset").with(csrf()).cookie(cookie)
				.contentType(MediaType.APPLICATION_JSON).content("{\"version\":2}")).andExpect(status().isOk());
		mvc.perform(get(url).param("s", oldToken).header("If-None-Match", etag)).andExpect(status().isNotFound());
		mvc.perform(get(url).header("If-None-Match", etag)).andExpect(status().isNotFound());
	}

	@Test
	void differentUploadsDifferentEtags() throws Exception {
		var cookie = Sessions.login(mvc, "o@x.com");
		String[] r = publishedRecipeWithPhoto(cookie);
		String second = uploadPhoto(cookie, r[0]);
		String a = mvc.perform(get(media.url(r[1], ImageVariant.THUMB)).cookie(cookie)).andReturn().getResponse()
				.getHeader("ETag");
		String b = mvc.perform(get(media.url(second, ImageVariant.THUMB)).cookie(cookie)).andReturn().getResponse()
				.getHeader("ETag");
		String d = mvc.perform(get(media.url(r[1], ImageVariant.DISPLAY)).cookie(cookie)).andReturn().getResponse()
				.getHeader("ETag");
		assertThat(a).isNotNull().isNotEqualTo(b).isNotEqualTo(d);
	}

	@Test
	void everyNonAvatarResponseIsPrivate() throws Exception {
		var cookie = Sessions.login(mvc, "o@x.com");
		String[] r = publishedRecipeWithPhoto(cookie);
		String url = media.url(r[1], ImageVariant.THUMB);
		String token = shareToken(r[0]);
		var cb = json.readTree(mvc.perform(post("/api/cookbooks").with(csrf()).cookie(cookie)
				.contentType(MediaType.APPLICATION_JSON).content("{\"name\":\"Dinners\"}")).andReturn().getResponse()
				.getContentAsString()).get("id").asText();
		mvc.perform(post("/api/cookbooks/" + cb + "/recipes").with(csrf()).cookie(cookie)
				.contentType(MediaType.APPLICATION_JSON).content("{\"shareToken\":\"" + token + "\"}"))
				.andExpect(status().isCreated());
		String cbToken = jdbc.queryForObject("select share_token from cookbook where id = ?::uuid", String.class, cb);
		java.util.List<String> cacheControls = new java.util.ArrayList<>();
		cacheControls.add(mvc.perform(get(url).cookie(cookie)).andExpect(status().isOk()).andReturn().getResponse()
				.getHeader("Cache-Control"));
		cacheControls.add(mvc.perform(get(url).param("s", token)).andExpect(status().isOk()).andReturn().getResponse()
				.getHeader("Cache-Control"));
		cacheControls.add(mvc.perform(get(url).param("c", cbToken)).andExpect(status().isOk()).andReturn()
				.getResponse().getHeader("Cache-Control"));
		mvc.perform(multipart(org.springframework.http.HttpMethod.PUT, "/api/cookbooks/" + cb + "/cover")
				.file(new MockMultipartFile("file", "p.jpg", "image/jpeg", TestImages.plainJpeg(800, 600)))
				.with(csrf()).cookie(cookie)).andExpect(status().isOk());
		String cover = jdbc.queryForObject("select cover_media_id from cookbook where id = ?::uuid", String.class, cb);
		String coverUrl = media.url(cover, ImageVariant.THUMB);
		cacheControls.add(mvc.perform(get(coverUrl).cookie(cookie)).andExpect(status().isOk()).andReturn()
				.getResponse().getHeader("Cache-Control"));
		cacheControls.add(mvc.perform(get(coverUrl).param("c", cbToken)).andExpect(status().isOk()).andReturn()
				.getResponse().getHeader("Cache-Control"));
		assertThat(cacheControls).hasSize(5).allSatisfy(c -> assertThat(c).startsWith("private"));
		String avatar = media.register(media.process(TestImages.orientation6(), Set.of(ImageVariant.AVATAR)),
				owner.getId(), MediaKind.AVATAR, null);
		mvc.perform(get(media.url(avatar, ImageVariant.AVATAR))).andExpect(header().string("Cache-Control",
				org.hamcrest.Matchers.startsWith("public")));
	}

	@Test
	void blobWithoutRowIs404() throws Exception {
		String id = media.register(media.process(TestImages.orientation6(), Set.of(ImageVariant.AVATAR)), owner.getId(), MediaKind.AVATAR, null);
		jdbc.update("delete from media where id = ?", id);
		mvc.perform(get(media.url(id, ImageVariant.AVATAR))).andExpect(status().isNotFound());
	}

	@Test
	void deleteRemovesRowAndBlobs() throws Exception {
		String id = media.register(media.process(TestImages.orientation6(), Set.of(ImageVariant.AVATAR)), owner.getId(), MediaKind.AVATAR, null);
		media.delete(id);
		assertThat(jdbc.queryForObject("select count(*) from media", Integer.class)).isZero();
		mvc.perform(get(media.url(id, ImageVariant.AVATAR))).andExpect(status().isNotFound());
	}

	@Test
	void twoPoliciesForOneKindFailFast() {
		MediaAccessPolicy p = new MediaAccessPolicy() {
			public MediaKind kind() { return MediaKind.AVATAR; }
			public Optional<String> cacheControl(Media m, jakarta.servlet.http.HttpServletRequest req) { return Optional.empty(); }
		};
		assertThatThrownBy(() -> MediaController.policiesByKind(List.of(p, new AvatarAccessPolicy())))
				.isInstanceOf(IllegalStateException.class).hasMessageContaining("AVATAR");
	}

	/** Runs the real V3 INSERT...SELECT: migrate a scratch schema to V2, add a user with an avatar, migrate to V3. */
	@Test
	void migrationBackfillsExistingAvatarKeys() throws Exception {
		String url = postgres.getJdbcUrl();
		try (Connection c = DriverManager.getConnection(url, postgres.getUsername(), postgres.getPassword());
				Statement s = c.createStatement()) {
			s.execute("drop schema if exists backfill_test cascade");
		}
		var cfg = Flyway.configure().dataSource(url, postgres.getUsername(), postgres.getPassword())
				.schemas("backfill_test").locations("classpath:db/migration");
		cfg.target("2").load().migrate();
		UUID uid = UUID.randomUUID();
		UUID noAvatar = UUID.randomUUID();
		try (Connection c = DriverManager.getConnection(url, postgres.getUsername(), postgres.getPassword());
				Statement s = c.createStatement()) {
			s.execute("insert into backfill_test.app_user(id,email,username,display_name,password_hash,avatar_key,created_at) "
					+ "values ('%s','a@x.com','a','A','h','old-avatar-key', now()), ('%s','b@x.com','b','B','h',null, now())"
							.formatted(uid, noAvatar));
		}
		cfg.target("3").load().migrate();
		try (Connection c = DriverManager.getConnection(url, postgres.getUsername(), postgres.getPassword());
				Statement s = c.createStatement();
				ResultSet rs = s.executeQuery("select id, owner_id, kind, recipe_id, created_at from backfill_test.media")) {
			assertThat(rs.next()).isTrue();
			assertThat(rs.getString("id")).isEqualTo("old-avatar-key");
			assertThat(rs.getObject("owner_id", UUID.class)).isEqualTo(uid);
			assertThat(rs.getString("kind")).isEqualTo("AVATAR");
			assertThat(rs.getObject("recipe_id")).isNull();
			assertThat(rs.getTimestamp("created_at").toInstant()).isBefore(Instant.now().plusSeconds(60));
			assertThat(rs.next()).isFalse();
		}
		try (Connection c = DriverManager.getConnection(url, postgres.getUsername(), postgres.getPassword());
				Statement s = c.createStatement()) {
			s.execute("drop schema backfill_test cascade");
		}
	}
}

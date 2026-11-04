package com.ricettine.recipe;

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
import com.ricettine.account.AccountDtos.NewAccountRequest;
import com.ricettine.account.AccountService;
import com.ricettine.media.BlobStore;
import com.ricettine.media.TestImages;
import jakarta.servlet.http.Cookie;
import java.time.Duration;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.test.web.servlet.ResultActions;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;

class RecipePhotoIT extends IntegrationTest {

	@Autowired JdbcTemplate jdbc;
	@Autowired AccountService accounts;
	@Autowired ObjectMapper json;
	@Autowired BlobStore blobs;
	@Autowired OrphanMediaCleanup orphans;

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

	String create(Cookie who) throws Exception {
		return json.readTree(mvc.perform(post("/api/recipes").with(csrf()).cookie(who))
			.andExpect(status().isCreated()).andReturn().getResponse().getContentAsString()).get("id").asText();
	}

	ResultActions upload(Cookie who, String recipeId, byte[] bytes) throws Exception {
		return mvc.perform(multipart("/api/recipes/" + recipeId + "/photos")
			.file(new MockMultipartFile("file", "p.jpg", "image/jpeg", bytes)).with(csrf()).cookie(who));
	}

	String uploadOk(Cookie who, String recipeId) throws Exception {
		return json.readTree(upload(who, recipeId, TestImages.plainJpeg(800, 600)).andExpect(status().isCreated())
			.andReturn().getResponse().getContentAsString()).get("mediaId").asText();
	}

	/** A complete recipe whose cover and steps reference the given photo ids (null = none). */
	static String body(long version, String cover, String... stepPhotos) {
		StringBuilder st = new StringBuilder();
		for (int i = 0; i < stepPhotos.length; i++) {
			st.append(i > 0 ? "," : "").append("{\"text\":\"step %d\",\"photoMediaId\":%s}".formatted(i,
					quote(stepPhotos[i])));
		}
		return """
			{"version":%d,"title":"Pasta","portions":2,"visibility":"PRIVATE","coverMediaId":%s,
			 "groups":[{"name":"","ingredients":[{"name":"flour"}]}],"steps":[%s]}"""
			.formatted(version, quote(cover), st);
	}

	static String quote(String s) {
		return s == null ? "null" : "\"" + s + "\"";
	}

	ResultActions save(Cookie who, String id, String body) throws Exception {
		return mvc.perform(put("/api/recipes/" + id).with(csrf()).cookie(who).contentType(MediaType.APPLICATION_JSON)
			.content(body));
	}

	boolean blobExists(String mediaId) {
		return blobs.get("img/" + mediaId + "/thumb.jpg").isPresent()
				|| blobs.get("img/" + mediaId + "/display.jpg").isPresent();
	}

	int mediaRows(String mediaId) {
		return jdbc.queryForObject("select count(*) from media where id = ?", Integer.class, mediaId);
	}

	@Test
	void uploadIsOwnerOnlyAndServedPrivately() throws Exception {
		String id = create(me);
		String res = upload(me, id, TestImages.plainJpeg(800, 600)).andExpect(status().isCreated())
			.andExpect(jsonPath("$.mediaId").isNotEmpty()).andReturn().getResponse().getContentAsString();
		JsonNode p = json.readTree(res);
		String mediaId = p.get("mediaId").asText();
		assertThat(p.get("thumbUrl").asText()).isEqualTo("/media/" + mediaId + "/thumb.jpg");
		assertThat(p.get("displayUrl").asText()).isEqualTo("/media/" + mediaId + "/display.jpg");
		assertThat(jdbc.queryForObject("select kind from media where id = ? and recipe_id = ?::uuid", String.class,
				mediaId, id)).isEqualTo("RECIPE");
		for (String url : new String[] { p.get("thumbUrl").asText(), p.get("displayUrl").asText() }) {
			mvc.perform(get(url).cookie(me)).andExpect(status().isOk())
				.andExpect(header().string("Cache-Control", "private, max-age=3600"));
			mvc.perform(get(url).cookie(other)).andExpect(status().isNotFound());
			mvc.perform(get(url)).andExpect(status().isNotFound());
		}
	}

	@Test
	void uploadToSomeoneElsesOrUnknownRecipeIs404() throws Exception {
		String id = create(me);
		upload(other, id, TestImages.plainJpeg(100, 100)).andExpect(status().isNotFound())
			.andExpect(jsonPath("$.code").value("recipe_not_found"));
		upload(me, UUID.randomUUID().toString(), TestImages.plainJpeg(100, 100)).andExpect(status().isNotFound());
		upload(me, "not-a-uuid", TestImages.plainJpeg(100, 100)).andExpect(status().isNotFound());
		// a non-owner's request is rejected before processing, even with a non-image
		upload(other, id, TestImages.fakeJpgPdf()).andExpect(status().isNotFound());
		assertThat(jdbc.queryForObject("select count(*) from media", Integer.class)).isZero();
	}

	@Test
	void disguisedPdfIs415() throws Exception {
		String id = create(me);
		upload(me, id, TestImages.fakeJpgPdf()).andExpect(status().isUnsupportedMediaType())
			.andExpect(jsonPath("$.code").value("unsupported_image"));
		assertThat(jdbc.queryForObject("select count(*) from media", Integer.class)).isZero();
	}

	@Test
	void savedPhotosAppearInTheRecipe() throws Exception {
		String id = create(me);
		String cover = uploadOk(me, id);
		String step = uploadOk(me, id);
		save(me, id, body(0, cover, null, step)).andExpect(status().isOk())
			.andExpect(jsonPath("$.cover.mediaId").value(cover))
			.andExpect(jsonPath("$.cover.thumbUrl").value("/media/" + cover + "/thumb.jpg"))
			.andExpect(jsonPath("$.cover.displayUrl").value("/media/" + cover + "/display.jpg"))
			.andExpect(jsonPath("$.steps[0].photo").doesNotExist())
			.andExpect(jsonPath("$.steps[1].photo.mediaId").value(step));
		mvc.perform(get("/api/recipes/" + id).cookie(me)).andExpect(jsonPath("$.cover.mediaId").value(cover))
			.andExpect(jsonPath("$.steps[1].photo.displayUrl").value("/media/" + step + "/display.jpg"));
		mvc.perform(get("/api/recipes/mine").cookie(me))
			.andExpect(jsonPath("$[0].coverThumbUrl").value("/media/" + cover + "/thumb.jpg"));
	}

	@Test
	void referencingAPhotoOfAnotherRecipeIs400() throws Exception {
		String id = create(me);
		String mine2 = create(me);
		String foreign = uploadOk(me, mine2);
		String othersRecipe = create(other);
		String othersPhoto = uploadOk(other, othersRecipe);
		save(me, id, body(0, foreign)).andExpect(status().isBadRequest())
			.andExpect(jsonPath("$.code").value("photo_not_in_recipe"))
			.andExpect(jsonPath("$.mediaIds.length()").value(1)).andExpect(jsonPath("$.mediaIds[0]").value(foreign));
		save(me, id, body(0, null, othersPhoto)).andExpect(status().isBadRequest())
			.andExpect(jsonPath("$.code").value("photo_not_in_recipe"));
		save(me, id, body(0, "no-such-media")).andExpect(status().isBadRequest())
			.andExpect(jsonPath("$.code").value("photo_not_in_recipe"));
		String avatar = "avatar-" + UUID.randomUUID();
		jdbc.update("insert into media (id, owner_id, kind, recipe_id, created_at) "
				+ "select ?, author_id, 'AVATAR', id, now() from recipe where id = ?::uuid", avatar, id);
		save(me, id, body(0, avatar)).andExpect(status().isBadRequest())
			.andExpect(jsonPath("$.code").value("photo_not_in_recipe"));
		assertThat(jdbc.queryForObject("select version from recipe where id = ?::uuid", Long.class, id)).isZero();
		assertThat(blobExists(foreign)).isTrue();
		assertThat(blobExists(othersPhoto)).isTrue();
	}

	@Test
	void photoNotInRecipeNamesOnlyTheOffendingIds() throws Exception {
		String id = create(me);
		String fresh = uploadOk(me, id);
		save(me, id, body(0, fresh, "gone-1", fresh)).andExpect(status().isBadRequest())
			.andExpect(jsonPath("$.code").value("photo_not_in_recipe"))
			.andExpect(jsonPath("$.mediaIds.length()").value(1)).andExpect(jsonPath("$.mediaIds[0]").value("gone-1"));
	}

	@Test
	void replacingAStepPhotoAndRemovingTheCoverDeleteTheirBlobs() throws Exception {
		String id = create(me);
		String cover = uploadOk(me, id);
		String first = uploadOk(me, id);
		String kept = uploadOk(me, id);
		save(me, id, body(0, cover, first, kept)).andExpect(status().isOk());
		String second = uploadOk(me, id);
		save(me, id, body(1, cover, second, kept)).andExpect(status().isOk());
		assertThat(blobExists(first)).isFalse();
		assertThat(mediaRows(first)).isZero();
		assertThat(blobExists(cover)).isTrue();
		save(me, id, body(2, null, second, kept)).andExpect(status().isOk())
			.andExpect(jsonPath("$.cover").doesNotExist());
		assertThat(blobExists(cover)).isFalse();
		assertThat(mediaRows(cover)).isZero();
		assertThat(blobExists(second)).isTrue();
		assertThat(blobExists(kept)).isTrue();
		// moving a photo from the cover to a step keeps it
		save(me, id, body(3, kept, second)).andExpect(status().isOk());
		assertThat(blobExists(kept)).isTrue();
	}

	@Test
	void rejectedSaveDeletesNothing() throws Exception {
		String id = create(me);
		String cover = uploadOk(me, id);
		save(me, id, body(0, cover, (String) null)).andExpect(status().isOk());
		save(me, id, body(0, null)).andExpect(status().isConflict());
		save(me, id, body(1, null).replace("\"Pasta\"", "\"" + "x".repeat(201) + "\""))
			.andExpect(status().isBadRequest());
		assertThat(blobExists(cover)).isTrue();
		assertThat(mediaRows(cover)).isEqualTo(1);
	}

	@Test
	void deletingTheRecipeDeletesAllItsPhotos() throws Exception {
		String id = create(me);
		String cover = uploadOk(me, id);
		String step = uploadOk(me, id);
		String unsaved = uploadOk(me, id);
		save(me, id, body(0, cover, step)).andExpect(status().isOk());
		String otherRecipe = create(me);
		String keep = uploadOk(me, otherRecipe);
		mvc.perform(delete("/api/recipes/" + id).with(csrf()).cookie(me)).andExpect(status().isNoContent());
		for (String m : new String[] { cover, step, unsaved }) {
			assertThat(blobExists(m)).as(m).isFalse();
			assertThat(mediaRows(m)).as(m).isZero();
		}
		assertThat(blobExists(keep)).isTrue();
	}

	@Test
	void accountDeletionDeletesRecipePhotoBlobs() throws Exception {
		String id = create(other);
		String cover = uploadOk(other, id);
		String unsaved = uploadOk(other, id);
		save(other, id, body(0, cover, (String) null)).andExpect(status().isOk());
		String mine = create(me);
		String keep = uploadOk(me, mine);
		mvc.perform(delete("/api/me").with(csrf()).cookie(other).contentType(MediaType.APPLICATION_JSON)
			.content("{\"password\":\"%s\"}".formatted(Sessions.PASSWORD))).andExpect(status().isNoContent());
		assertThat(blobExists(cover)).isFalse();
		assertThat(blobExists(unsaved)).isFalse();
		assertThat(jdbc.queryForObject("select count(*) from recipe where id = ?::uuid", Integer.class, id)).isZero();
		assertThat(blobExists(keep)).isTrue();
	}

	@Test
	void orphanCleanupDeletesOnlyUnreferencedUploads() throws Exception {
		String id = create(me);
		String cover = uploadOk(me, id);
		String step = uploadOk(me, id);
		String orphan = uploadOk(me, id);
		save(me, id, body(0, cover, step)).andExpect(status().isOk());
		String young = uploadOk(me, id);
		jdbc.update("update media set created_at = now() - interval '1 hour' where id <> ?", young);

		orphans.deleteOrphansOlderThan(Duration.ofMinutes(30));

		assertThat(blobExists(orphan)).isFalse();
		assertThat(mediaRows(orphan)).isZero();
		assertThat(blobExists(young)).isTrue();
		assertThat(blobExists(cover)).isTrue();
		assertThat(blobExists(step)).isTrue();

		orphans.deleteOrphansOlderThan(Duration.ZERO);
		assertThat(blobExists(young)).isFalse();
		assertThat(blobExists(cover)).isTrue();
		assertThat(blobExists(step)).isTrue();
		mvc.perform(get("/api/recipes/" + id).cookie(me)).andExpect(jsonPath("$.cover.mediaId").value(cover))
			.andExpect(jsonPath("$.steps[0].photo.mediaId").value(step));
	}

	@Test
	void photoOnlyStepCountsForPublish() throws Exception {
		String id = create(me);
		String photo = uploadOk(me, id);
		String photoOnly = """
			{"version":0,"title":"Pasta","portions":2,"visibility":"PRIVATE",
			 "groups":[{"name":"","ingredients":[{"name":"flour"}]}],"steps":[{"text":"  ","photoMediaId":"%s"}]}"""
			.formatted(photo);
		save(me, id, photoOnly).andExpect(status().isOk());
		mvc.perform(post("/api/recipes/" + id + "/publish").with(csrf()).cookie(me)
			.contentType(MediaType.APPLICATION_JSON).content("{\"version\":1}")).andExpect(status().isOk())
			.andExpect(jsonPath("$.status").value("PUBLISHED"))
			.andExpect(jsonPath("$.steps[0].photo.mediaId").value(photo));
		// and it keeps a published recipe complete
		save(me, id, photoOnly.replace("\"version\":0", "\"version\":2")).andExpect(status().isOk());
	}

	@Test
	void publishedRecipePhotosAreReadableWithTheShareToken() throws Exception {
		String id = create(me);
		String photo = uploadOk(me, id);
		save(me, id, body(0, photo, (String) null)).andExpect(status().isOk());
		String token = jdbc.queryForObject("select share_token from recipe where id = ?::uuid", String.class, id);
		String url = "/media/" + photo + "/thumb.jpg";
		// draft: the token does not work yet
		mvc.perform(get(url).param("s", token)).andExpect(status().isNotFound());
		mvc.perform(post("/api/recipes/" + id + "/publish").with(csrf()).cookie(me)
			.contentType(MediaType.APPLICATION_JSON).content("{\"version\":1}")).andExpect(status().isOk());
		mvc.perform(get(url).param("s", token)).andExpect(status().isOk())
			.andExpect(header().string("Cache-Control", "private, max-age=3600"));
		mvc.perform(get(url).param("s", token).cookie(other)).andExpect(status().isOk());
		mvc.perform(get(url).param("s", "wrong")).andExpect(status().isNotFound());
		mvc.perform(get(url)).andExpect(status().isNotFound());
	}

	void publish(Cookie who, String id, long version) throws Exception {
		mvc.perform(post("/api/recipes/" + id + "/publish").with(csrf()).cookie(who)
			.contentType(MediaType.APPLICATION_JSON).content("{\"version\":" + version + "}"))
			.andExpect(status().isOk());
	}

	String token(String id) {
		return jdbc.queryForObject("select share_token from recipe where id = ?::uuid", String.class, id);
	}

	@Test
	void shareTokenOfAnotherRecipeOfTheSameAuthorDoesNotUnlockThePhoto() throws Exception {
		String a = create(me);
		save(me, a, body(0, null, (String) null)).andExpect(status().isOk());
		publish(me, a, 1);
		String b = create(me);
		String photo = uploadOk(me, b);
		save(me, b, body(0, photo, (String) null)).andExpect(status().isOk());
		String url = "/media/" + photo + "/thumb.jpg";
		mvc.perform(get(url).param("s", token(a))).andExpect(status().isNotFound());
		publish(me, b, 1);
		mvc.perform(get(url).param("s", token(a))).andExpect(status().isNotFound());
		mvc.perform(get(url).param("s", token(b))).andExpect(status().isOk());
	}

	@Test
	void shareTokenOfAnotherUsersRecipeDoesNotUnlockThePhoto() throws Exception {
		String mine = create(me);
		save(me, mine, body(0, null, (String) null)).andExpect(status().isOk());
		publish(me, mine, 1);
		String theirs = create(other);
		String photo = uploadOk(other, theirs);
		save(other, theirs, body(0, photo, (String) null)).andExpect(status().isOk());
		publish(other, theirs, 1);
		mvc.perform(get("/media/" + photo + "/thumb.jpg").param("s", token(mine))).andExpect(status().isNotFound());
		mvc.perform(get("/media/" + photo + "/thumb.jpg").param("s", token(theirs))).andExpect(status().isOk());
	}

	@Test
	void aPhotoMovedBetweenStepsInOneSaveSurvives() throws Exception {
		String id = create(me);
		String photo = uploadOk(me, id);
		save(me, id, body(0, null, null, photo, null)).andExpect(status().isOk());
		save(me, id, body(1, null, null, null, photo)).andExpect(status().isOk())
			.andExpect(jsonPath("$.steps[2].photo.mediaId").value(photo));
		assertThat(blobExists(photo)).isTrue();
		assertThat(mediaRows(photo)).isEqualTo(1);
	}

	@Test
	void removingOneOfTwoReferencesToThePhotoKeepsIt() throws Exception {
		String id = create(me);
		String photo = uploadOk(me, id);
		save(me, id, body(0, photo, photo)).andExpect(status().isOk());
		save(me, id, body(1, null, photo)).andExpect(status().isOk());
		assertThat(blobExists(photo)).isTrue();
		assertThat(mediaRows(photo)).isEqualTo(1);
		save(me, id, body(2, photo, (String) null)).andExpect(status().isOk());
		assertThat(blobExists(photo)).isTrue();
		save(me, id, body(3, null, (String) null)).andExpect(status().isOk());
		assertThat(blobExists(photo)).isFalse();
	}
}

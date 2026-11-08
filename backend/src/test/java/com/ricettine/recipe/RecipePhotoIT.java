package com.ricettine.recipe;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.ricettine.IntegrationTest;
import com.ricettine.Sessions;
import com.ricettine.media.BlobStore;
import com.ricettine.media.TestImages;
import com.ricettine.testsupport.TestData;
import jakarta.servlet.http.Cookie;
import java.time.Duration;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;
import tools.jackson.databind.JsonNode;

class RecipePhotoIT extends IntegrationTest {

	@Autowired BlobStore blobs;
	@Autowired OrphanMediaCleanup orphans;

	Cookie me;
	Cookie other;

	@BeforeEach
	void setUp() throws Exception {
		me = data.user("me@x.com", "mario", "Me", true);
		other = data.user("other@x.com", "other1", "Other", false);
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

	int mediaRows(String mediaId) {
		return jdbc.queryForObject("select count(*) from media where id = ?", Integer.class, mediaId);
	}

	@Test
	void uploadIsOwnerOnlyAndServedPrivately() throws Exception {
		String id = data.draft(me);
		String res = data.uploadPhoto(me, id, TestImages.plainJpeg(800, 600)).andExpect(status().isCreated())
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
		String id = data.draft(me);
		data.uploadPhoto(other, id, TestImages.plainJpeg(100, 100)).andExpect(status().isNotFound())
			.andExpect(jsonPath("$.code").value("recipe_not_found"));
		data.uploadPhoto(me, UUID.randomUUID().toString(), TestImages.plainJpeg(100, 100)).andExpect(status().isNotFound());
		data.uploadPhoto(me, "not-a-uuid", TestImages.plainJpeg(100, 100)).andExpect(status().isNotFound());
		// a non-owner's request is rejected before processing, even with a non-image
		data.uploadPhoto(other, id, TestImages.fakeJpgPdf()).andExpect(status().isNotFound());
		assertThat(jdbc.queryForObject("select count(*) from media", Integer.class)).isZero();
	}

	@Test
	void disguisedPdfIs415() throws Exception {
		String id = data.draft(me);
		data.uploadPhoto(me, id, TestImages.fakeJpgPdf()).andExpect(status().isUnsupportedMediaType())
			.andExpect(jsonPath("$.code").value("unsupported_image"));
		assertThat(jdbc.queryForObject("select count(*) from media", Integer.class)).isZero();
	}

	@Test
	void savedPhotosAppearInTheRecipe() throws Exception {
		String id = data.draft(me);
		String cover = data.uploadPhoto(me, id);
		String step = data.uploadPhoto(me, id);
		data.putRecipe(me, id, body(0, cover, null, step)).andExpect(status().isOk())
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
		String id = data.draft(me);
		String mine2 = data.draft(me);
		String foreign = data.uploadPhoto(me, mine2);
		String othersRecipe = data.draft(other);
		String othersPhoto = data.uploadPhoto(other, othersRecipe);
		data.putRecipe(me, id, body(0, foreign)).andExpect(status().isBadRequest())
			.andExpect(jsonPath("$.code").value("photo_not_in_recipe"))
			.andExpect(jsonPath("$.mediaIds.length()").value(1)).andExpect(jsonPath("$.mediaIds[0]").value(foreign));
		data.putRecipe(me, id, body(0, null, othersPhoto)).andExpect(status().isBadRequest())
			.andExpect(jsonPath("$.code").value("photo_not_in_recipe"));
		data.putRecipe(me, id, body(0, "no-such-media")).andExpect(status().isBadRequest())
			.andExpect(jsonPath("$.code").value("photo_not_in_recipe"));
		String avatar = "avatar-" + UUID.randomUUID();
		jdbc.update("insert into media (id, owner_id, kind, recipe_id, created_at) "
				+ "select ?, author_id, 'AVATAR', id, now() from recipe where id = ?::uuid", avatar, id);
		data.putRecipe(me, id, body(0, avatar)).andExpect(status().isBadRequest())
			.andExpect(jsonPath("$.code").value("photo_not_in_recipe"));
		assertThat(jdbc.queryForObject("select version from recipe where id = ?::uuid", Long.class, id)).isZero();
		assertThat(TestData.blobExists(blobs, foreign)).isTrue();
		assertThat(TestData.blobExists(blobs, othersPhoto)).isTrue();
	}

	@Test
	void photoNotInRecipeNamesOnlyTheOffendingIds() throws Exception {
		String id = data.draft(me);
		String fresh = data.uploadPhoto(me, id);
		data.putRecipe(me, id, body(0, fresh, "gone-1", fresh)).andExpect(status().isBadRequest())
			.andExpect(jsonPath("$.code").value("photo_not_in_recipe"))
			.andExpect(jsonPath("$.mediaIds.length()").value(1)).andExpect(jsonPath("$.mediaIds[0]").value("gone-1"));
	}

	@Test
	void replacingAStepPhotoAndRemovingTheCoverDeleteTheirBlobs() throws Exception {
		String id = data.draft(me);
		String cover = data.uploadPhoto(me, id);
		String first = data.uploadPhoto(me, id);
		String kept = data.uploadPhoto(me, id);
		data.putRecipe(me, id, body(0, cover, first, kept)).andExpect(status().isOk());
		String second = data.uploadPhoto(me, id);
		data.putRecipe(me, id, body(1, cover, second, kept)).andExpect(status().isOk());
		assertThat(TestData.blobExists(blobs, first)).isFalse();
		assertThat(mediaRows(first)).isZero();
		assertThat(TestData.blobExists(blobs, cover)).isTrue();
		data.putRecipe(me, id, body(2, null, second, kept)).andExpect(status().isOk())
			.andExpect(jsonPath("$.cover").doesNotExist());
		assertThat(TestData.blobExists(blobs, cover)).isFalse();
		assertThat(mediaRows(cover)).isZero();
		assertThat(TestData.blobExists(blobs, second)).isTrue();
		assertThat(TestData.blobExists(blobs, kept)).isTrue();
		// moving a photo from the cover to a step keeps it
		data.putRecipe(me, id, body(3, kept, second)).andExpect(status().isOk());
		assertThat(TestData.blobExists(blobs, kept)).isTrue();
	}

	@Test
	void rejectedSaveDeletesNothing() throws Exception {
		String id = data.draft(me);
		String cover = data.uploadPhoto(me, id);
		data.putRecipe(me, id, body(0, cover, (String) null)).andExpect(status().isOk());
		data.putRecipe(me, id, body(0, null)).andExpect(status().isConflict());
		data.putRecipe(me, id, body(1, null).replace("\"Pasta\"", "\"" + "x".repeat(201) + "\""))
			.andExpect(status().isBadRequest());
		assertThat(TestData.blobExists(blobs, cover)).isTrue();
		assertThat(mediaRows(cover)).isEqualTo(1);
	}

	@Test
	void deletingTheRecipeDeletesAllItsPhotos() throws Exception {
		String id = data.draft(me);
		String cover = data.uploadPhoto(me, id);
		String step = data.uploadPhoto(me, id);
		String unsaved = data.uploadPhoto(me, id);
		data.putRecipe(me, id, body(0, cover, step)).andExpect(status().isOk());
		String otherRecipe = data.draft(me);
		String keep = data.uploadPhoto(me, otherRecipe);
		mvc.perform(delete("/api/recipes/" + id).with(csrf()).cookie(me)).andExpect(status().isNoContent());
		for (String m : new String[] { cover, step, unsaved }) {
			assertThat(TestData.blobExists(blobs, m)).as(m).isFalse();
			assertThat(mediaRows(m)).as(m).isZero();
		}
		assertThat(TestData.blobExists(blobs, keep)).isTrue();
	}

	@Test
	void accountDeletionDeletesRecipePhotoBlobs() throws Exception {
		String id = data.draft(other);
		String cover = data.uploadPhoto(other, id);
		String unsaved = data.uploadPhoto(other, id);
		data.putRecipe(other, id, body(0, cover, (String) null)).andExpect(status().isOk());
		String mine = data.draft(me);
		String keep = data.uploadPhoto(me, mine);
		mvc.perform(delete("/api/me").with(csrf()).cookie(other).contentType(MediaType.APPLICATION_JSON)
			.content("{\"password\":\"%s\"}".formatted(Sessions.PASSWORD))).andExpect(status().isNoContent());
		assertThat(TestData.blobExists(blobs, cover)).isFalse();
		assertThat(TestData.blobExists(blobs, unsaved)).isFalse();
		assertThat(jdbc.queryForObject("select count(*) from recipe where id = ?::uuid", Integer.class, id)).isZero();
		assertThat(TestData.blobExists(blobs, keep)).isTrue();
	}

	@Test
	void orphanCleanupDeletesOnlyUnreferencedUploads() throws Exception {
		String id = data.draft(me);
		String cover = data.uploadPhoto(me, id);
		String step = data.uploadPhoto(me, id);
		String orphan = data.uploadPhoto(me, id);
		data.putRecipe(me, id, body(0, cover, step)).andExpect(status().isOk());
		String young = data.uploadPhoto(me, id);
		jdbc.update("update media set created_at = now() - interval '1 hour' where id <> ?", young);

		orphans.deleteOrphansOlderThan(Duration.ofMinutes(30));

		assertThat(TestData.blobExists(blobs, orphan)).isFalse();
		assertThat(mediaRows(orphan)).isZero();
		assertThat(TestData.blobExists(blobs, young)).isTrue();
		assertThat(TestData.blobExists(blobs, cover)).isTrue();
		assertThat(TestData.blobExists(blobs, step)).isTrue();

		orphans.deleteOrphansOlderThan(Duration.ZERO);
		assertThat(TestData.blobExists(blobs, young)).isFalse();
		assertThat(TestData.blobExists(blobs, cover)).isTrue();
		assertThat(TestData.blobExists(blobs, step)).isTrue();
		mvc.perform(get("/api/recipes/" + id).cookie(me)).andExpect(jsonPath("$.cover.mediaId").value(cover))
			.andExpect(jsonPath("$.steps[0].photo.mediaId").value(step));
	}

	@Test
	void photoOnlyStepCountsForPublish() throws Exception {
		String id = data.draft(me);
		String photo = data.uploadPhoto(me, id);
		String photoOnly = """
			{"version":0,"title":"Pasta","portions":2,"visibility":"PRIVATE",
			 "groups":[{"name":"","ingredients":[{"name":"flour"}]}],"steps":[{"text":"  ","photoMediaId":"%s"}]}"""
			.formatted(photo);
		data.putRecipe(me, id, photoOnly).andExpect(status().isOk());
		data.publishRequest(me, id, 1).andExpect(status().isOk())
			.andExpect(jsonPath("$.status").value("PUBLISHED"))
			.andExpect(jsonPath("$.steps[0].photo.mediaId").value(photo));
		// and it keeps a published recipe complete
		data.putRecipe(me, id, photoOnly.replace("\"version\":0", "\"version\":2")).andExpect(status().isOk());
	}

	@Test
	void publishedRecipePhotosAreReadableWithTheShareToken() throws Exception {
		String id = data.draft(me);
		String photo = data.uploadPhoto(me, id);
		data.putRecipe(me, id, body(0, photo, (String) null)).andExpect(status().isOk());
		String token = jdbc.queryForObject("select share_token from recipe where id = ?::uuid", String.class, id);
		String url = "/media/" + photo + "/thumb.jpg";
		// draft: the token does not work yet
		mvc.perform(get(url).param("s", token)).andExpect(status().isNotFound());
		data.publish(me, id, 1);
		mvc.perform(get(url).param("s", token)).andExpect(status().isOk())
			.andExpect(header().string("Cache-Control", "private, no-cache"));
		mvc.perform(get(url).param("s", token).cookie(other)).andExpect(status().isOk());
		mvc.perform(get(url).param("s", "wrong")).andExpect(status().isNotFound());
		mvc.perform(get(url)).andExpect(status().isNotFound());
	}

	@Test
	void shareTokenOfAnotherRecipeOfTheSameAuthorDoesNotUnlockThePhoto() throws Exception {
		String a = data.draft(me);
		data.putRecipe(me, a, body(0, null, (String) null)).andExpect(status().isOk());
		data.publish(me, a, 1);
		String b = data.draft(me);
		String photo = data.uploadPhoto(me, b);
		data.putRecipe(me, b, body(0, photo, (String) null)).andExpect(status().isOk());
		String url = "/media/" + photo + "/thumb.jpg";
		mvc.perform(get(url).param("s", data.recipeShareToken(a))).andExpect(status().isNotFound());
		data.publish(me, b, 1);
		mvc.perform(get(url).param("s", data.recipeShareToken(a))).andExpect(status().isNotFound());
		mvc.perform(get(url).param("s", data.recipeShareToken(b))).andExpect(status().isOk());
	}

	@Test
	void shareTokenOfAnotherUsersRecipeDoesNotUnlockThePhoto() throws Exception {
		String mine = data.draft(me);
		data.putRecipe(me, mine, body(0, null, (String) null)).andExpect(status().isOk());
		data.publish(me, mine, 1);
		String theirs = data.draft(other);
		String photo = data.uploadPhoto(other, theirs);
		data.putRecipe(other, theirs, body(0, photo, (String) null)).andExpect(status().isOk());
		data.publish(other, theirs, 1);
		mvc.perform(get("/media/" + photo + "/thumb.jpg").param("s", data.recipeShareToken(mine))).andExpect(status().isNotFound());
		mvc.perform(get("/media/" + photo + "/thumb.jpg").param("s", data.recipeShareToken(theirs))).andExpect(status().isOk());
	}

	@Test
	void aPhotoMovedBetweenStepsInOneSaveSurvives() throws Exception {
		String id = data.draft(me);
		String photo = data.uploadPhoto(me, id);
		data.putRecipe(me, id, body(0, null, null, photo, null)).andExpect(status().isOk());
		data.putRecipe(me, id, body(1, null, null, null, photo)).andExpect(status().isOk())
			.andExpect(jsonPath("$.steps[2].photo.mediaId").value(photo));
		assertThat(TestData.blobExists(blobs, photo)).isTrue();
		assertThat(mediaRows(photo)).isEqualTo(1);
	}

	@Test
	void removingOneOfTwoReferencesToThePhotoKeepsIt() throws Exception {
		String id = data.draft(me);
		String photo = data.uploadPhoto(me, id);
		data.putRecipe(me, id, body(0, photo, photo)).andExpect(status().isOk());
		data.putRecipe(me, id, body(1, null, photo)).andExpect(status().isOk());
		assertThat(TestData.blobExists(blobs, photo)).isTrue();
		assertThat(mediaRows(photo)).isEqualTo(1);
		data.putRecipe(me, id, body(2, photo, (String) null)).andExpect(status().isOk());
		assertThat(TestData.blobExists(blobs, photo)).isTrue();
		data.putRecipe(me, id, body(3, null, (String) null)).andExpect(status().isOk());
		assertThat(TestData.blobExists(blobs, photo)).isFalse();
	}
}

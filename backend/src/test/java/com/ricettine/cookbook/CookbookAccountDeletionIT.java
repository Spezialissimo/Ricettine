package com.ricettine.cookbook;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.multipart;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.ricettine.media.BlobStore;
import com.ricettine.media.TestImages;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpMethod;
import org.springframework.http.MediaType;
import org.springframework.mock.web.MockMultipartFile;

/** Account deletion and cookbooks: bea owns "A-book" and co-authors mario's "B-book". */
class CookbookAccountDeletionIT extends CookbookIT {

	@Autowired BlobStore blobs;

	boolean blobExists(String mediaId) {
		return blobs.get("img/" + mediaId + "/thumb.jpg").isPresent()
				|| blobs.get("img/" + mediaId + "/display.jpg").isPresent();
	}

	@Test
	void deletionRemovesOwnedCookbooksAndKeepsOthers() throws Exception {
		String aBook = cookbook(bea);
		String bBook = cookbook(owner);
		jdbc.update("update cookbook set name = 'A-book' where id = ?::uuid", aBook);
		jdbc.update("update cookbook set name = 'B-book' where id = ?::uuid", bBook);
		String coverId = json.readTree(mvc.perform(multipart(HttpMethod.PUT, "/api/cookbooks/" + aBook + "/cover")
			.file(new MockMultipartFile("file", "p.jpg", "image/jpeg", TestImages.plainJpeg(400, 300)))
			.with(csrf()).cookie(bea)).andExpect(status().isOk()).andReturn().getResponse().getContentAsString())
			.get("cover").get("mediaId").asText();
		assertThat(blobExists(coverId)).isTrue();
		invite(bea, aBook); // an outstanding invite of the doomed cookbook
		join(bBook, bea);
		String r1 = publishedRecipe(bea);
		String r2 = publishedRecipe(owner);
		jdbc.update("update recipe set visibility = 'PUBLIC' where id = ?::uuid", r2);
		addRecipe(bea, bBook, r1).andExpect(status().isCreated());
		addRecipe(bea, bBook, r2).andExpect(status().isCreated());

		mvc.perform(delete("/api/me").with(csrf()).cookie(bea).contentType(MediaType.APPLICATION_JSON)
			.content("{\"password\":\"" + com.ricettine.Sessions.PASSWORD + "\"}")).andExpect(status().isNoContent());

		assertThat(jdbc.queryForObject("select count(*) from cookbook where id = ?::uuid", Integer.class, aBook)).isZero();
		assertThat(jdbc.queryForObject("select count(*) from one_time_token where cookbook_id = ?::uuid",
			Integer.class, aBook)).isZero();
		assertThat(jdbc.queryForObject("select count(*) from media where id = ?", Integer.class, coverId)).isZero();
		assertThat(blobExists(coverId)).isFalse();
		assertThat(jdbc.queryForObject("select count(*) from cookbook where id = ?::uuid", Integer.class, bBook)).isOne();
		assertThat(jdbc.queryForObject("select count(*) from cookbook_author where cookbook_id = ?::uuid",
			Integer.class, bBook)).isZero();
		List<UUID> entries = jdbc.queryForList("select recipe_id from cookbook_entry where cookbook_id = ?::uuid",
			UUID.class, bBook);
		assertThat(entries).containsExactly(UUID.fromString(r2));
		assertThat(jdbc.queryForObject("select added_by from cookbook_entry where cookbook_id = ?::uuid",
			UUID.class, bBook)).isNull();
		assertThat(jdbc.queryForObject("select count(*) from recipe where id = ?::uuid", Integer.class, r2)).isOne();
	}
}

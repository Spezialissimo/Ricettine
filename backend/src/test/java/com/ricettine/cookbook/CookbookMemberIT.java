package com.ricettine.cookbook;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.util.UUID;
import org.junit.jupiter.api.Test;
import tools.jackson.databind.JsonNode;

class CookbookMemberIT extends CookbookIT {

	int recipeRows() {
		return jdbc.queryForObject("select count(*) from recipe", Integer.class);
	}

	@Test
	void removeAuthorOptionallyTakesTheirEntries() throws Exception {
		String id = data.createCookbook(owner);
		join(id, carl);
		String c1 = data.publishedRecipe(carl, "PRIVATE");
		String c2 = data.publishedRecipe(carl, "PRIVATE");
		String a1 = data.publishedRecipe(owner, "PRIVATE");
		addRecipe(carl, id, c1).andExpect(status().isCreated());
		addRecipe(carl, id, c2).andExpect(status().isCreated());
		addRecipe(owner, id, a1).andExpect(status().isCreated());

		removeAuthor(owner, id, userId("carl1"), false).andExpect(status().isNoContent());
		mvc.perform(get("/api/cookbooks/" + id).cookie(carl)).andExpect(status().isNotFound());
		JsonNode kept = data.read(mvc.perform(get("/api/cookbooks/" + id).cookie(owner)).andReturn());
		assertThat(kept.get("authors")).isEmpty();
		assertThat(kept.get("recipes")).hasSize(3);

		join(id, carl); // re-invite
		removeAuthor(owner, id, userId("carl1"), true).andExpect(status().isNoContent());
		JsonNode left = data.read(mvc.perform(get("/api/cookbooks/" + id).cookie(owner)).andReturn());
		assertThat(left.get("recipes")).hasSize(1);
		assertThat(left.get("recipes").get(0).get("recipeId").asText()).isEqualTo(a1);
		assertThat(recipeRows()).isEqualTo(3);
	}

	@Test
	void authorLeavesAndCanBeReinvited() throws Exception {
		String id = data.createCookbook(owner);
		join(id, bea);
		removeAuthor(bea, id, userId("bea1"), false).andExpect(status().isNoContent());
		mvc.perform(get("/api/cookbooks/" + id).cookie(bea)).andExpect(status().isNotFound());
		mvc.perform(get("/api/cookbooks/mine").cookie(bea)).andExpect(jsonPath("$.length()").value(0));
		join(id, bea);
	}

	@Test
	void permissionsOfRemoval() throws Exception {
		String id = data.createCookbook(owner);
		join(id, bea);
		join(id, carl);
		// owner can't leave, whoever asks
		removeAuthor(owner, id, userId("mario"), false).andExpect(status().isConflict())
			.andExpect(jsonPath("$.code").value("owner_cannot_leave"));
		removeAuthor(bea, id, userId("mario"), false).andExpect(status().isConflict())
			.andExpect(jsonPath("$.code").value("owner_cannot_leave"));
		// an author can't remove another author
		removeAuthor(bea, id, userId("carl1"), false).andExpect(status().isForbidden())
			.andExpect(jsonPath("$.code").value("cookbook_owner_only"));
		// a non-author target is 404, a non-member caller is 404
		removeAuthor(owner, id, UUID.randomUUID(), false).andExpect(status().isNotFound())
			.andExpect(jsonPath("$.code").value("cookbook_not_found"));
		mvc.perform(delete("/api/cookbooks/" + id + "/authors/not-a-uuid").with(csrf()).cookie(owner))
			.andExpect(status().isNotFound());
		String other = data.createCookbook(owner);
		removeAuthor(bea, other, userId("bea1"), false).andExpect(status().isNotFound());
		assertThat(jdbc.queryForObject("select count(*) from cookbook_author", Integer.class)).isEqualTo(2);
		// a leaving author's removeRecipes only touches their own entries
		String mine = data.publishedRecipe(owner, "PRIVATE");
		addRecipe(owner, id, mine).andExpect(status().isCreated());
		removeAuthor(bea, id, userId("bea1"), true).andExpect(status().isNoContent());
		assertThat(data.read(mvc.perform(get("/api/cookbooks/" + id).cookie(owner)).andReturn()).get("recipes")).hasSize(1);
	}

	@Test
	void personIdsOnlyForMembers() throws Exception {
		String id = data.createCookbook(owner);
		join(id, bea);
		String token = jdbc.queryForObject("select share_token from cookbook", String.class);
		mvc.perform(get("/api/c/" + token)).andExpect(status().isOk()).andExpect(jsonPath("$.owner.id").doesNotExist())
			.andExpect(jsonPath("$.authors[0].id").doesNotExist());
		mvc.perform(get("/api/c/" + token).cookie(carl)).andExpect(jsonPath("$.owner.id").doesNotExist());
		mvc.perform(get("/api/c/" + token).cookie(bea)).andExpect(jsonPath("$.owner.id").exists())
			.andExpect(jsonPath("$.authors[0].id").exists());
	}
}

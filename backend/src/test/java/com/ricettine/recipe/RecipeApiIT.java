package com.ricettine.recipe;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.ricettine.IntegrationTest;
import jakarta.servlet.http.Cookie;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.test.web.servlet.ResultActions;
import tools.jackson.databind.JsonNode;

class RecipeApiIT extends IntegrationTest {


	Cookie me;
	Cookie other;

	@BeforeEach
	void setUp() throws Exception {
		me = data.user("me@x.com", "mario", "Me", true);
		other = data.user("other@x.com", "other1", "Other", false);
	}

	JsonNode create(Cookie who) throws Exception {
		MvcResult r = mvc.perform(post("/api/recipes").with(csrf()).cookie(who)).andExpect(status().isCreated())
			.andReturn();
		return json.readTree(r.getResponse().getContentAsString());
	}

	static String full(long version, String title, int steps) {
		StringBuilder st = new StringBuilder();
		for (int i = 0; i < steps; i++) {
			st.append(i > 0 ? "," : "").append("{\"text\":\"step %d\"}".formatted(i));
		}
		return """
			{"version":%d,"title":%s,"portions":4,"prepMinutes":10,"cookMinutes":20,"source":" gran ","notes":"",
			 "visibility":"PRIVATE","groups":[
			  {"name":"Dough","ingredients":[{"amount":500,"unit":"g","name":"flour"},{"name":"salt","note":" to taste "}]},
			  {"name":"","ingredients":[]},
			  {"name":"Sauce","ingredients":[{"amount":0.5,"unit":"l","name":"milk"}]}],
			 "steps":[%s]}""".formatted(version, title == null ? "null" : "\"" + title + "\"", st);
	}

	ResultActions putRecipe(Cookie who, Object id, String body) throws Exception {
		return mvc.perform(put("/api/recipes/" + id).with(csrf()).cookie(who).contentType(MediaType.APPLICATION_JSON)
			.content(body));
	}

	ResultActions publish(Cookie who, Object id, long version) throws Exception {
		return mvc.perform(post("/api/recipes/" + id + "/publish").with(csrf()).cookie(who)
			.contentType(MediaType.APPLICATION_JSON).content("{\"version\":" + version + "}"));
	}

	JsonNode fetch(Cookie who, Object id) throws Exception {
		return json.readTree(mvc.perform(get("/api/recipes/" + id).cookie(who)).andExpect(status().isOk())
			.andReturn().getResponse().getContentAsString());
	}

	@Test
	void createAssignsIdAndEmptyDraft() throws Exception {
		MvcResult r = mvc.perform(post("/api/recipes").with(csrf()).cookie(me)).andExpect(status().isCreated())
			.andExpect(jsonPath("$.status").value("DRAFT")).andExpect(jsonPath("$.visibility").value("PRIVATE"))
			.andExpect(jsonPath("$.portions").value(1)).andExpect(jsonPath("$.version").value(0))
			.andExpect(jsonPath("$.groups").isEmpty()).andExpect(jsonPath("$.steps").isEmpty())
			.andExpect(jsonPath("$.title").doesNotExist()).andExpect(jsonPath("$.shareUrl").doesNotExist())
			.andExpect(jsonPath("$.publishedAt").doesNotExist()).andReturn();
		JsonNode n = json.readTree(r.getResponse().getContentAsString());
		UUID id = UUID.fromString(n.get("id").asText());
		assertThat(r.getResponse().getHeader("Location")).isEqualTo("/api/recipes/" + id);
		assertThat(n.get("createdAt").asText()).isNotBlank();
		assertThat(jdbc.queryForObject("select share_token from recipe where id = ?", String.class, id)).hasSize(43);
		assertThat(fetch(me, id).get("id").asText()).isEqualTo(id.toString());
		assertThat(create(me).get("id").asText()).isNotEqualTo(id.toString());
	}

	@Test
	void otherUsersRecipeIs404() throws Exception {
		String id = create(me).get("id").asText();
		mvc.perform(get("/api/recipes/" + id).cookie(other)).andExpect(status().isNotFound())
			.andExpect(jsonPath("$.code").value("recipe_not_found"));
		putRecipe(other, id, full(0, "Hijack", 1)).andExpect(status().isNotFound())
			.andExpect(jsonPath("$.code").value("recipe_not_found"));
		publish(other, id, 0).andExpect(status().isNotFound()).andExpect(jsonPath("$.code").value("recipe_not_found"));
		mvc.perform(delete("/api/recipes/" + id).with(csrf()).cookie(other)).andExpect(status().isNotFound())
			.andExpect(jsonPath("$.code").value("recipe_not_found"));
		mvc.perform(get("/api/recipes/" + UUID.randomUUID()).cookie(me)).andExpect(status().isNotFound());
		mvc.perform(get("/api/recipes/not-a-uuid").cookie(me)).andExpect(status().isNotFound());
		assertThat(fetch(me, id).get("title").isNull()).isTrue();
		mvc.perform(delete("/api/recipes/" + id).with(csrf()).cookie(me)).andExpect(status().isNoContent());
		mvc.perform(get("/api/recipes/" + id).cookie(me)).andExpect(status().isNotFound());
	}

	@Test
	void saveReplacesChildrenInOrder() throws Exception {
		String id = create(me).get("id").asText();
		putRecipe(me, id, full(0, "  Pasta ", 3)).andExpect(status().isOk()).andExpect(jsonPath("$.version").value(1))
			.andExpect(jsonPath("$.title").value("Pasta")).andExpect(jsonPath("$.source").value("gran"))
			.andExpect(jsonPath("$.notes").doesNotExist()).andExpect(jsonPath("$.groups.length()").value(2))
			.andExpect(jsonPath("$.groups[0].name").value("Dough"))
			.andExpect(jsonPath("$.groups[0].ingredients[0].amount").value(500))
			.andExpect(jsonPath("$.groups[0].ingredients[0].unit").value("g"))
			.andExpect(jsonPath("$.groups[0].ingredients[1].name").value("salt"))
			.andExpect(jsonPath("$.groups[0].ingredients[1].note").value("to taste"))
			.andExpect(jsonPath("$.groups[0].ingredients[1].amount").doesNotExist())
			.andExpect(jsonPath("$.groups[1].name").value("Sauce"))
			.andExpect(jsonPath("$.groups[1].ingredients[0].amount").value(0.5))
			.andExpect(jsonPath("$.steps[0].text").value("step 0")).andExpect(jsonPath("$.steps[2].text").value("step 2"));
		// second save replaces everything, in the new order
		String second = """
			{"version":1,"title":"Pasta","portions":2,"visibility":"PUBLIC","groups":[
			 {"name":"B","ingredients":[{"name":"z"},{"name":"a"}]},{"name":"A","ingredients":[{"name":"q"}]}],
			 "steps":[{"text":"two"},{"text":""}]}""";
		putRecipe(me, id, second).andExpect(status().isOk()).andExpect(jsonPath("$.version").value(2));
		JsonNode n = fetch(me, id);
		assertThat(n.get("visibility").asText()).isEqualTo("PUBLIC");
		assertThat(n.get("portions").asInt()).isEqualTo(2);
		assertThat(n.get("groups").get(0).get("name").asText()).isEqualTo("B");
		assertThat(n.get("groups").get(0).get("ingredients").get(0).get("name").asText()).isEqualTo("z");
		assertThat(n.get("groups").get(0).get("ingredients").get(1).get("name").asText()).isEqualTo("a");
		assertThat(n.get("groups").get(1).get("name").asText()).isEqualTo("A");
		assertThat(n.get("steps")).hasSize(2);
		assertThat(n.get("steps").get(1).get("text").asText()).isEmpty();
		assertThat(n.get("prepMinutes").isNull()).isTrue();
		assertThat(jdbc.queryForObject("select count(*) from step", Integer.class)).isEqualTo(2);
		assertThat(jdbc.queryForObject("select count(*) from ingredient", Integer.class)).isEqualTo(3);
		assertThat(jdbc.queryForObject("select count(*) from ingredient_group", Integer.class)).isEqualTo(2);
	}

	@Test
	void staleVersionIs409() throws Exception {
		String id = create(me).get("id").asText();
		putRecipe(me, id, full(0, "First", 1)).andExpect(status().isOk());
		putRecipe(me, id, full(0, "Second", 2)).andExpect(status().isConflict())
			.andExpect(jsonPath("$.code").value("recipe_conflict"));
		JsonNode n = fetch(me, id);
		assertThat(n.get("title").asText()).isEqualTo("First");
		assertThat(n.get("steps")).hasSize(1);
		assertThat(n.get("version").asLong()).isEqualTo(1);
		publish(me, id, 0).andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("recipe_conflict"));
		// version beats validation in precedence
		putRecipe(me, id, full(0, "x".repeat(201), 1)).andExpect(status().isConflict());
	}

	@Test
	void concurrentSavesNeverProduce500() throws Exception {
		ExecutorService pool = Executors.newFixedThreadPool(2);
		try {
			for (int round = 0; round < 5; round++) {
				String id = create(me).get("id").asText();
				CountDownLatch go = new CountDownLatch(1);
				List<Future<Integer>> calls = new ArrayList<>();
				for (int t = 0; t < 2; t++) {
					String body = full(0, "T" + t, 5 + t);
					calls.add(pool.submit(() -> {
						go.await();
						return putRecipe(me, id, body).andReturn().getResponse().getStatus();
					}));
				}
				go.countDown();
				List<Integer> codes = new ArrayList<>();
				for (Future<Integer> f : calls) {
					codes.add(f.get());
				}
				assertThat(codes).containsExactlyInAnyOrder(200, 409);
				assertThat(fetch(me, id).get("version").asLong()).isEqualTo(1);
			}
		}
		finally {
			pool.shutdownNow();
		}
	}

	@Test
	void concurrentSavesOfPopulatedRecipeGiveOne200AndOne409() throws Exception {
		ExecutorService pool = Executors.newFixedThreadPool(2);
		try {
			for (int round = 0; round < 5; round++) {
				String id = create(me).get("id").asText();
				putRecipe(me, id, full(0, "Base", 3)).andExpect(status().isOk());
				putRecipe(me, id, full(1, "Base2", 4)).andExpect(status().isOk());
				CountDownLatch go = new CountDownLatch(1);
				List<Future<Integer>> calls = new ArrayList<>();
				for (int t = 0; t < 2; t++) {
					String body = full(2, "R" + t, 2 + t);
					calls.add(pool.submit(() -> {
						go.await();
						return putRecipe(me, id, body).andReturn().getResponse().getStatus();
					}));
				}
				go.countDown();
				List<Integer> codes = new ArrayList<>();
				for (Future<Integer> f : calls) {
					codes.add(f.get());
				}
				assertThat(codes).containsExactlyInAnyOrder(200, 409);
				assertThat(fetch(me, id).get("version").asLong()).isEqualTo(3);
			}
		}
		finally {
			pool.shutdownNow();
		}
	}

	@Test
	void putResponseUpdatedAtMatchesFollowingGet() throws Exception {
		String id = create(me).get("id").asText();
		JsonNode put = json.readTree(putRecipe(me, id, full(0, "T", 1)).andExpect(status().isOk()).andReturn()
			.getResponse().getContentAsString());
		assertThat(fetch(me, id).get("updatedAt").asText()).isEqualTo(put.get("updatedAt").asText());
		JsonNode pub = json.readTree(publish(me, id, 1).andExpect(status().isOk()).andReturn().getResponse()
			.getContentAsString());
		JsonNode got = fetch(me, id);
		assertThat(got.get("updatedAt").asText()).isEqualTo(pub.get("updatedAt").asText());
		assertThat(got.get("publishedAt").asText()).isEqualTo(pub.get("publishedAt").asText());
	}

	@Test
	void versionIsRequired() throws Exception {
		String id = create(me).get("id").asText();
		putRecipe(me, id, full(0, "T", 1).replace("\"version\":0,", "")).andExpect(status().isBadRequest())
			.andExpect(jsonPath("$.code").value("validation_failed")).andExpect(jsonPath("$.fields.version")
				.value("required"));
		mvc.perform(post("/api/recipes/" + id + "/publish").with(csrf()).cookie(me)
			.contentType(MediaType.APPLICATION_JSON).content("{}")).andExpect(status().isBadRequest())
			.andExpect(jsonPath("$.code").value("validation_failed"))
			.andExpect(jsonPath("$.fields.version").value("required"));
	}

	@Test
	void blankStepsDoNotCountAsSteps() throws Exception {
		String id = create(me).get("id").asText();
		String blank = full(0, "T", 0).replace("\"steps\":[]", "\"steps\":[{\"text\":\"  \"},{\"text\":\"\"}]");
		putRecipe(me, id, blank).andExpect(status().isOk());
		publish(me, id, 1).andExpect(status().isBadRequest()).andExpect(jsonPath("$.code").value("recipe_incomplete"))
			.andExpect(jsonPath("$.fields.steps").exists()).andExpect(jsonPath("$.fields.length()").value(1));
		putRecipe(me, id, full(1, "T", 1)).andExpect(status().isOk());
		publish(me, id, 2).andExpect(status().isOk());
		putRecipe(me, id, blank.replace("\"version\":0", "\"version\":3")).andExpect(status().isBadRequest())
			.andExpect(jsonPath("$.code").value("recipe_incomplete")).andExpect(jsonPath("$.fields.steps").exists());
		assertThat(fetch(me, id).get("steps")).hasSize(1);
	}

	@Test
	void validationFailuresUseDottedFieldPaths() throws Exception {
		String id = create(me).get("id").asText();
		String body = """
			{"version":0,"title":"t","portions":0,"visibility":"PRIVATE","groups":[
			 {"name":"g","ingredients":[{"name":"a"},{"name":"b"},{"amount":0,"name":"c"}]}],
			 "steps":[{"text":"a"},{"text":"b"},{"text":"c"},{"text":"%s"}]}""".formatted("x".repeat(5001));
		putRecipe(me, id, body).andExpect(status().isBadRequest())
			.andExpect(jsonPath("$.code").value("validation_failed"))
			.andExpect(jsonPath("$.fields.portions").exists())
			.andExpect(jsonPath("$.fields['groups[0].ingredients[2].amount']").exists())
			.andExpect(jsonPath("$.fields['steps[3].text']").exists());
		putRecipe(me, id, full(0, "x".repeat(201), 1)).andExpect(status().isBadRequest())
			.andExpect(jsonPath("$.fields.title").exists());
		String badUnit = full(0, "t", 1).replace("\"unit\":\"g\"", "\"unit\":\"oz\"");
		putRecipe(me, id, badUnit).andExpect(status().isBadRequest())
			.andExpect(jsonPath("$.code").value("invalid_unit"))
			.andExpect(jsonPath("$.fields['groups[0].ingredients[0].unit']").value("invalid_unit"));
		assertThat(fetch(me, id).get("version").asLong()).isEqualTo(0);
	}

	@Test
	void unknownPhotoIdIs400() throws Exception {
		String id = create(me).get("id").asText();
		String body = full(0, "t", 1).replace("\"steps\":[{\"text\":\"step 0\"}]",
				"\"steps\":[{\"text\":\"a\",\"photoMediaId\":\"abc\"}]");
		putRecipe(me, id, body).andExpect(status().isBadRequest())
			.andExpect(jsonPath("$.code").value("photo_not_in_recipe"));
		putRecipe(me, id, full(0, "t", 1).replace("\"portions\"", "\"coverMediaId\":\"abc\",\"portions\""))
			.andExpect(status().isBadRequest()).andExpect(jsonPath("$.code").value("photo_not_in_recipe"));
	}

	@Test
	void publishRequiresTitleIngredientStep() throws Exception {
		String id = create(me).get("id").asText();
		publish(me, id, 0).andExpect(status().isBadRequest()).andExpect(jsonPath("$.code").value("recipe_incomplete"))
			.andExpect(jsonPath("$.fields.length()").value(3)).andExpect(jsonPath("$.fields.title").exists())
			.andExpect(jsonPath("$.fields.ingredients").exists()).andExpect(jsonPath("$.fields.steps").exists());
		putRecipe(me, id, """
			{"version":0,"title":"T","portions":1,"visibility":"PRIVATE",
			 "groups":[{"name":"g","ingredients":[{"name":"a"}]}],"steps":[]}""").andExpect(status().isOk());
		publish(me, id, 1).andExpect(status().isBadRequest()).andExpect(jsonPath("$.fields.length()").value(1))
			.andExpect(jsonPath("$.fields.steps").exists());
		putRecipe(me, id, full(1, "T", 1)).andExpect(status().isOk());
		publish(me, id, 2).andExpect(status().isOk()).andExpect(jsonPath("$.status").value("PUBLISHED"))
			.andExpect(jsonPath("$.version").value(3)).andExpect(jsonPath("$.publishedAt").exists());
		String firstPublishedAt = fetch(me, id).get("publishedAt").asText();
		publish(me, id, 3).andExpect(status().isOk());
		assertThat(fetch(me, id).get("publishedAt").asText()).isEqualTo(firstPublishedAt);
	}

	@Test
	void publishedRecipeCannotBecomeIncomplete() throws Exception {
		String id = create(me).get("id").asText();
		putRecipe(me, id, full(0, "Keep", 2)).andExpect(status().isOk());
		publish(me, id, 1).andExpect(status().isOk());
		putRecipe(me, id, full(2, "Keep", 0)).andExpect(status().isBadRequest())
			.andExpect(jsonPath("$.code").value("recipe_incomplete")).andExpect(jsonPath("$.fields.steps").exists())
			.andExpect(jsonPath("$.fields.length()").value(1));
		putRecipe(me, id, full(2, "  ", 2)).andExpect(status().isBadRequest())
			.andExpect(jsonPath("$.code").value("recipe_incomplete")).andExpect(jsonPath("$.fields.title").exists());
		// validation errors outrank incompleteness
		putRecipe(me, id, full(2, "x".repeat(201), 0)).andExpect(status().isBadRequest())
			.andExpect(jsonPath("$.code").value("validation_failed"));
		JsonNode n = fetch(me, id);
		assertThat(n.get("version").asLong()).isEqualTo(2);
		assertThat(n.get("title").asText()).isEqualTo("Keep");
		assertThat(n.get("steps")).hasSize(2);
		assertThat(n.get("status").asText()).isEqualTo("PUBLISHED");
		// a complete edit still works
		putRecipe(me, id, full(2, "Renamed", 1)).andExpect(status().isOk()).andExpect(jsonPath("$.version").value(3));
	}

	@Test
	void mineIsNewestFirstAndOwnOnly() throws Exception {
		String a = create(me).get("id").asText();
		String b = create(me).get("id").asText();
		String c = create(other).get("id").asText();
		putRecipe(me, a, full(0, "Alpha", 1)).andExpect(status().isOk());
		mvc.perform(get("/api/recipes/mine").cookie(me)).andExpect(status().isOk())
			.andExpect(jsonPath("$.length()").value(2)).andExpect(jsonPath("$[0].id").value(a))
			.andExpect(jsonPath("$[0].title").value("Alpha")).andExpect(jsonPath("$[0].status").value("DRAFT"))
			.andExpect(jsonPath("$[0].visibility").value("PRIVATE")).andExpect(jsonPath("$[0].coverThumbUrl")
				.doesNotExist())
			.andExpect(jsonPath("$[0].updatedAt").exists()).andExpect(jsonPath("$[1].id").value(b));
		putRecipe(me, b, full(0, "Beta", 1)).andExpect(status().isOk());
		mvc.perform(get("/api/recipes/mine").cookie(me)).andExpect(jsonPath("$[0].id").value(b))
			.andExpect(jsonPath("$[1].id").value(a));
		publish(me, a, 1).andExpect(status().isOk());
		mvc.perform(get("/api/recipes/mine").cookie(me)).andExpect(jsonPath("$[0].id").value(a));
		mvc.perform(get("/api/recipes/mine").cookie(other)).andExpect(jsonPath("$.length()").value(1))
			.andExpect(jsonPath("$[0].id").value(c));
	}

	@Test
	void accountDeletionDeletesRecipes() throws Exception {
		String id = create(me).get("id").asText();
		putRecipe(me, id, full(0, "Gone", 2)).andExpect(status().isOk());
		String keep = create(other).get("id").asText();
		jdbc.update("delete from app_user where email = 'me@x.com'");
		assertThat(jdbc.queryForObject("select count(*) from recipe", Integer.class)).isEqualTo(1);
		assertThat(jdbc.queryForObject("select count(*) from step", Integer.class)).isZero();
		assertThat(jdbc.queryForObject("select count(*) from ingredient", Integer.class)).isZero();
		assertThat(jdbc.queryForObject("select count(*) from ingredient_group", Integer.class)).isZero();
		assertThat(fetch(other, keep).get("id").asText()).isEqualTo(keep);
	}

	@Test
	void versionedDeleteRejectsStaleVersion() throws Exception {
		String id = create(me).get("id").asText();
		putRecipe(me, id, full(0, "T", 1)).andExpect(status().isOk());
		mvc.perform(delete("/api/recipes/" + id).param("version", "0").with(csrf()).cookie(me))
			.andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("recipe_conflict"));
		assertThat(fetch(me, id).get("title").asText()).isEqualTo("T");
		mvc.perform(delete("/api/recipes/" + id).param("version", "1").with(csrf()).cookie(other))
			.andExpect(status().isNotFound());
		mvc.perform(delete("/api/recipes/" + id).param("version", "1").with(csrf()).cookie(me))
			.andExpect(status().isNoContent());
		mvc.perform(get("/api/recipes/" + id).cookie(me)).andExpect(status().isNotFound());
		// without a version the delete is unconditional (backwards compatible)
		String id2 = create(me).get("id").asText();
		putRecipe(me, id2, full(0, "T", 1)).andExpect(status().isOk());
		mvc.perform(delete("/api/recipes/" + id2).with(csrf()).cookie(me)).andExpect(status().isNoContent());
		mvc.perform(get("/api/recipes/" + id2).cookie(me)).andExpect(status().isNotFound());
	}

	@Test
	void hugeGroupListIsRejectedWithoutIterating() throws Exception {
		String id = create(me).get("id").asText();
		String groups = String.join(",", java.util.Collections.nCopies(1001, "{\"name\":\"\",\"ingredients\":[]}"));
		String body = """
			{"version":0,"title":"t","portions":1,"visibility":"PRIVATE","groups":[%s],"steps":[]}"""
			.formatted(groups);
		putRecipe(me, id, body).andExpect(status().isBadRequest())
			.andExpect(jsonPath("$.code").value("validation_failed"))
			.andExpect(jsonPath("$.fields.groups").value("too_many"));
		// 1000 dropped (empty) groups are still fine
		putRecipe(me, id, body.replaceFirst("\\{\"name\":\"\",\"ingredients\":\\[\\]\\},", ""))
			.andExpect(status().isOk());
	}

	@Test
	void anonymousIs401() throws Exception {
		mvc.perform(post("/api/recipes").with(csrf())).andExpect(status().isUnauthorized());
		mvc.perform(get("/api/recipes/mine")).andExpect(status().isUnauthorized());
		mvc.perform(get("/api/recipes/" + UUID.randomUUID())).andExpect(status().isUnauthorized());
		mvc.perform(put("/api/recipes/" + UUID.randomUUID()).with(csrf()).contentType(MediaType.APPLICATION_JSON)
			.content("{}")).andExpect(status().isUnauthorized());
		mvc.perform(delete("/api/recipes/" + UUID.randomUUID()).with(csrf())).andExpect(status().isUnauthorized());
	}
}

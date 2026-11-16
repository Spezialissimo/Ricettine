package com.ricettine.site;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.ricettine.DemoIntegrationTest;
import com.ricettine.media.BlobStore;
import jakarta.servlet.http.Cookie;
import java.util.function.Supplier;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import tools.jackson.databind.JsonNode;

class DemoSeederIT extends DemoIntegrationTest {

	@Autowired
	DemoSeeder seeder;

	@org.springframework.test.context.bean.override.mockito.MockitoSpyBean
	BlobStore blobs;

	/** DemoIntegrationTest empties the demo database before each test; here the real seeder fills it again. */
	@BeforeEach
	void seed() {
		blobs.deleteByPrefix(Site.DEMO.blobPrefix());
		// At startup there is no request; the seeder must cope (the test framework would otherwise bind a mock one).
		org.springframework.web.context.request.RequestContextHolder.resetRequestAttributes();
		seeder.seed();
	}

	private <T> T onDemo(Supplier<T> query) {
		return SiteContext.callAs(Site.DEMO, query);
	}

	private int count(String table) {
		return onDemo(() -> jdbc.queryForObject("select count(*) from " + table, Integer.class));
	}

	@Test
	void seedsUsersRecipesCookbooks() {
		assertThat(count("app_user")).isEqualTo(2);
		assertThat(count("recipe")).isEqualTo(12);
		assertThat(count("cookbook")).isEqualTo(3);
		assertThat(jdbc.queryForObject("select count(*) from recipe", Integer.class)).isZero();
	}

	@Test
	void stepPhotosAreAttachedAndRender() throws Exception {
		DemoFixture fixture = json.readValue(getClass().getResourceAsStream(DemoSeeder.FIXTURE), DemoFixture.class);
		long expected = fixture.recipes().stream().flatMap(r -> r.steps().stream()).filter(s -> s.photo() != null)
			.count();
		assertThat(expected).isPositive();
		assertThat(onDemo(() -> jdbc.queryForObject("select count(*) from step where photo_media_id is not null",
				Integer.class))).isEqualTo((int) expected);
		// Recipe photos are readable with the recipe's share token, as the share/public view does.
		java.util.List<java.util.Map<String, Object>> rows = onDemo(() -> jdbc.queryForList("""
				select s.photo_media_id as id, r.share_token as token from step s join recipe r on r.id = s.recipe_id
				where s.photo_media_id is not null
				"""));
		assertThat(rows).hasSize((int) expected);
		for (java.util.Map<String, Object> row : rows) {
			for (String variant : new String[] { "thumb", "display" }) {
				mvc.perform(demo(get("/media/" + row.get("id") + "/" + variant + ".jpg")).param("s",
						(String) row.get("token"))).andExpect(status().isOk());
			}
		}
		// recipes without step photos keep photo-less steps, and every recipe still has its cover
		for (DemoFixture.Recipe r : fixture.recipes()) {
			long want = r.steps().stream().filter(s -> s.photo() != null).count();
			assertThat(onDemo(() -> jdbc.queryForObject("""
					select count(*) from step s join recipe r on r.id = s.recipe_id
					where r.title = ? and s.photo_media_id is not null
					""", Long.class, r.title()))).as(r.key()).isEqualTo(want);
		}
	}

	@Test
	void davideHasAvatarOspiteDoesNot() {
		assertThat(onDemo(() -> jdbc.queryForObject(
				"select avatar_key from app_user where username = 'davide'", String.class))).isNotBlank();
		assertThat(onDemo(() -> jdbc.queryForObject(
				"select avatar_key from app_user where username = 'ospite'", String.class))).isNull();
	}

	@Test
	void feedOnDemoShowsDavidesPublicRecipes() throws Exception {
		Cookie session = ospiteSession();
		JsonNode feed = json.readTree(mvc.perform(demo(get("/api/feed")).cookie(session))
			.andExpect(status().isOk()).andReturn().getResponse().getContentAsString());
		JsonNode items = feed.isArray() ? feed : feed.get("items");
		assertThat(items).hasSize(10);
	}

	@Test
	void ospiteIsAuthorOfPrimi() {
		assertThat(onDemo(() -> jdbc.queryForObject("""
				select count(*) from cookbook_author a join cookbook c on c.id = a.cookbook_id
				join app_user u on u.id = a.user_id where c.name = 'Primi della domenica' and u.username = 'ospite'
				""", Integer.class))).isEqualTo(1);
	}

	@Test
	void seedIsIdempotentAfterReset() {
		SiteContext.runAs(Site.DEMO, this::truncateAll);
		blobs.deleteByPrefix(Site.DEMO.blobPrefix());
		seeder.seed();
		assertThat(count("app_user")).isEqualTo(2);
		assertThat(count("recipe")).isEqualTo(12);
		assertThat(count("cookbook")).isEqualTo(3);
	}

	@Test
	void blobWipeFailureDoesNotStopSeeding() {
		SiteContext.runAs(Site.DEMO, this::truncateAll);
		org.mockito.Mockito.doThrow(new RuntimeException("storage down")).when(blobs).deleteByPrefix(
				org.mockito.ArgumentMatchers.anyString());
		seeder.seed();
		assertThat(count("app_user")).isEqualTo(2);
		assertThat(count("recipe")).isEqualTo(12);
	}

	@Test
	void setupNotRequiredOnDemo() throws Exception {
		JsonNode status = json.readTree(mvc.perform(demo(get("/api/setup/status"))).andReturn().getResponse()
			.getContentAsString());
		assertThat(status.get("setupRequired").asBoolean()).isFalse();
	}

	@Test
	void brokenFixtureLeavesTheDemoUnavailableWithoutThrowing() throws Exception {
		SiteContext.runAs(Site.DEMO, this::truncateAll);
		seeder.seedSafely("/demo/does-not-exist.json");
		assertThat(count("app_user")).isZero();
		mvc.perform(demo(post("/api/demo/session")).with(csrf())).andExpect(status().isServiceUnavailable());
	}

	private Cookie ospiteSession() throws Exception {
		return mvc.perform(demo(post("/api/demo/session")).with(csrf())).andExpect(status().isNoContent())
			.andReturn().getResponse().getCookie("SESSION");
	}
}

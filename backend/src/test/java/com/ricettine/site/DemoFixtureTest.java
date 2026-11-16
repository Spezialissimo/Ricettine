package com.ricettine.site;

import static org.assertj.core.api.Assertions.assertThat;

import com.ricettine.recipe.Unit;
import com.ricettine.recipe.Visibility;
import java.io.IOException;
import java.io.InputStream;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Set;
import java.util.regex.Pattern;
import org.junit.jupiter.api.Test;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

/** Guards the committed demo content: references resolve, units are valid, photos are licensed, text is Italian. */
class DemoFixtureTest {

	private static final JsonMapper JSON = JsonMapper.builder().build();
	/** Explicit allow-list of licence names; anything else (for example a non-commercial CC variant) fails the build. */
	private static final Set<String> LICENSES = Set.of("Unsplash License", "Pexels License", "CC0", "Public domain");
	private static final Pattern LICENSE_PATTERN = Pattern
		.compile("CC BY \\d\\.\\d|CC BY-SA \\d\\.\\d|Free Art License( \\d\\.\\d)?");
	private static final long MAX_IMAGE_BYTES = 600 * 1024;
	private static final List<String> ENGLISH_MARKERS = List.of(" the ", " and ", " with ", "minutes");

	private final JsonNode recipes = read("/demo/recipes.json");
	private final JsonNode photos = read("/demo/photos.json");

	private static JsonNode read(String path) {
		try (InputStream in = DemoFixtureTest.class.getResourceAsStream(path)) {
			assertThat(in).as(path).isNotNull();
			return JSON.readTree(in);
		}
		catch (IOException e) {
			throw new IllegalStateException(e);
		}
	}

	private static long size(String path) {
		try (InputStream in = DemoFixtureTest.class.getResourceAsStream(path)) {
			assertThat(in).as(path).isNotNull();
			return in.readAllBytes().length;
		}
		catch (IOException e) {
			throw new IllegalStateException(e);
		}
	}

	@Test
	void hasExactlyTwelveRecipesWithUniqueKeys() {
		Set<String> keys = new HashSet<>();
		recipes.get("recipes").forEach(r -> keys.add(r.get("key").asString()));
		assertThat(recipes.get("recipes")).hasSize(12);
		assertThat(keys).hasSize(12);
	}

	@Test
	void everyPhotoReferenceResolvesToAnEntryAndAFile() {
		List<String> refs = new ArrayList<>();
		recipes.get("recipes").forEach(r -> refs.add(r.get("photo").asString()));
		recipes.get("cookbooks").forEach(c -> refs.add(c.get("cover").asString()));
		for (String ref : refs) {
			assertThat(photos.has(ref)).as("photos.json has " + ref).isTrue();
			String file = photos.get(ref).get("file").asString();
			assertThat(size("/demo/images/" + file)).as(file).isPositive();
		}
	}

	@Test
	void everyPhotoIsAttributedAndLicensed() {
		photos.properties().forEach(e -> {
			JsonNode p = e.getValue();
			for (String field : List.of("sourceUrl", "photographer", "downloadUrl", "file")) {
				assertThat(p.path(field).asString("")).as(e.getKey() + "." + field).isNotBlank();
			}
			assertThat(p.get("sourceUrl").asString()).startsWith("https://");
			String license = p.get("license").asString();
			assertThat(LICENSES.contains(license) || LICENSE_PATTERN.matcher(license).matches())
				.as(e.getKey() + " licence '" + license + "' is allowed").isTrue();
		});
	}

	@Test
	void everyStepPhotoResolvesToAnEntryAndAFile() {
		recipes.get("recipes").forEach(r -> r.get("steps").forEach(s -> {
			JsonNode photo = s.get("photo");
			if (photo == null) {
				return;
			}
			assertThat(photos.has(photo.asString())).as(r.get("key") + " step photo " + photo).isTrue();
			assertThat(size("/demo/images/" + photos.get(photo.asString()).get("file").asString())).isPositive();
		}));
	}

	@Test
	void everyPhotoIsUsed() {
		Set<String> used = new HashSet<>();
		recipes.get("recipes").forEach(r -> {
			used.add(r.get("photo").asString());
			r.get("steps").forEach(s -> {
				if (s.has("photo")) {
					used.add(s.get("photo").asString());
				}
			});
		});
		recipes.get("cookbooks").forEach(c -> used.add(c.get("cover").asString()));
		assertThat(used).containsExactlyInAnyOrderElementsOf(photos.propertyNames());
	}

	@Test
	void everyImageIsWithinTheSizeLimit() {
		photos.properties().forEach(e -> assertThat(size("/demo/images/" + e.getValue().get("file").asString()))
				.as(e.getKey()).isLessThanOrEqualTo(MAX_IMAGE_BYTES));
		assertThat(size("/demo/avatars/davide.jpg")).isLessThanOrEqualTo(MAX_IMAGE_BYTES);
	}

	@Test
	void everyUnitIsAValidUnitCode() {
		recipes.get("recipes").forEach(r -> r.get("groups").forEach(g -> g.get("ingredients").forEach(i -> {
			JsonNode unit = i.get("unit");
			if (!unit.isNull()) {
				assertThat(Unit.isValid(unit.asString())).as("unit " + unit + " in " + r.get("key")).isTrue();
			}
		})));
	}

	@Test
	void everyUserReferenceIsDefined() {
		Set<String> users = new HashSet<>();
		recipes.get("users").forEach(u -> users.add(u.get("username").asString()));
		recipes.get("recipes").forEach(r -> assertThat(users).contains(r.get("author").asString()));
		recipes.get("cookbooks").forEach(c -> {
			assertThat(users).contains(c.get("owner").asString());
			c.get("authors").forEach(a -> assertThat(users).contains(a.asString()));
		});
	}

	@Test
	void cookbookRecipesExist() {
		Set<String> keys = new HashSet<>();
		recipes.get("recipes").forEach(r -> keys.add(r.get("key").asString()));
		recipes.get("cookbooks").forEach(c -> c.get("recipes").forEach(k -> assertThat(keys).contains(k.asString())));
	}

	@Test
	void fieldsRespectTheRecipeLimitsAndVisibility() {
		recipes.get("recipes").forEach(r -> {
			String key = r.get("key").asString();
			assertThat(r.get("title").asString().length()).as(key).isBetween(1, 200);
			assertThat(r.get("portions").asInt()).as(key).isBetween(1, 100);
			assertThat(r.get("prepMinutes").asInt()).as(key).isBetween(0, 10080);
			assertThat(r.get("cookMinutes").asInt()).as(key).isBetween(0, 10080);
			assertThat(r.get("notes").asString().length()).as(key).isLessThanOrEqualTo(10_000);
			assertThat(Visibility.valueOf(r.get("visibility").asString())).isNotNull();
			assertThat(r.get("steps")).as(key).isNotEmpty();
			r.get("steps").forEach(s -> assertThat(s.get("text").asString().length()).isBetween(1, 5000));
			r.get("groups").forEach(g -> g.get("ingredients").forEach(i -> {
				assertThat(i.get("name").asString().length()).as(key).isBetween(1, 200);
				assertThat(i.path("note").asString("").length()).as(key).isLessThanOrEqualTo(200);
				if (!i.get("amount").isNull()) {
					assertThat(i.get("amount").asDouble()).as(key).isPositive();
				}
			}));
		});
	}

	@Test
	void publicationSplitMatchesThePlan() {
		int publishedPublic = 0;
		int publishedPrivate = 0;
		int drafts = 0;
		for (JsonNode r : recipes.get("recipes")) {
			if (!r.get("published").asBoolean()) {
				drafts++;
				assertThat(r.get("author").asString()).isEqualTo("ospite");
			}
			else if ("PUBLIC".equals(r.get("visibility").asString())) {
				publishedPublic++;
			}
			else {
				publishedPrivate++;
			}
		}
		assertThat(publishedPublic).isEqualTo(10);
		assertThat(publishedPrivate).isEqualTo(1);
		assertThat(drafts).isEqualTo(1);
	}

	@Test
	void titlesAndStepsAreWrittenInItalian() {
		recipes.get("recipes").forEach(r -> {
			List<String> texts = new ArrayList<>();
			texts.add(r.get("title").asString());
			r.get("steps").forEach(s -> texts.add(s.get("text").asString()));
			for (String text : texts) {
				String padded = " " + text.toLowerCase() + " ";
				for (String marker : ENGLISH_MARKERS) {
					assertThat(padded).as(r.get("key") + " contains '" + marker + "'").doesNotContain(marker);
				}
			}
		});
	}

}

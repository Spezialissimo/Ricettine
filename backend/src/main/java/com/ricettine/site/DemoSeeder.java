package com.ricettine.site;

import com.ricettine.account.AccountDtos.NewAccountRequest;
import com.ricettine.account.AccountService;
import com.ricettine.cookbook.CookbookAuthor;
import com.ricettine.cookbook.CookbookAuthorRepository;
import com.ricettine.cookbook.CookbookDtos.CookbookDto;
import com.ricettine.cookbook.CookbookDtos.CookbookInput;
import com.ricettine.cookbook.CookbookService;
import com.ricettine.media.BlobStore;
import com.ricettine.media.ImageVariant;
import com.ricettine.media.MediaService;
import com.ricettine.recipe.RecipeDtos.GroupDto;
import com.ricettine.recipe.RecipeDtos.IngredientDto;
import com.ricettine.recipe.RecipeDtos.RecipeDto;
import com.ricettine.recipe.RecipeDtos.RecipeInput;
import com.ricettine.recipe.RecipeDtos.RecipeRef;
import com.ricettine.recipe.RecipeDtos.StepInput;
import com.ricettine.recipe.RecipeService;
import java.io.IOException;
import java.io.InputStream;
import java.io.UncheckedIOException;
import java.time.OffsetDateTime;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.annotation.DependsOn;
import org.springframework.context.event.EventListener;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;
import org.springframework.web.context.request.RequestContextHolder;
import org.springframework.web.context.request.ServletRequestAttributes;
import tools.jackson.databind.ObjectMapper;

/**
 * Fills the (freshly recreated and migrated) demo database from the committed fixture, through the real services so
 * validation, image processing and the per-site blob prefix all apply. Runs once on {@link ApplicationReadyEvent}.
 * The demo blob prefix is wiped first, so blobs of earlier boots (the S3 bucket is versioned) do not pile up.
 * A seeding failure is logged and never stops startup: the main site must not go down with it; the demo then answers
 * 503 {@code demo_unavailable} (no {@code ospite}). The services build share links from the current request, which
 * startup has none of, so a stand-in request is bound while seeding (the links it yields are never stored).
 */
@Component
@ConditionalOnProperty(name = "ricettine.demo.enabled", havingValue = "true")
@DependsOn("demoFlyway")
public class DemoSeeder {

	static final String FIXTURE = "/demo/recipes.json";
	private static final Logger log = LoggerFactory.getLogger(DemoSeeder.class);
	private static final Set<ImageVariant> PHOTO_VARIANTS = Set.of(ImageVariant.THUMB, ImageVariant.DISPLAY);
	private static final String PHOTOS = "/demo/photos.json";

	private final AccountService accounts;
	private final RecipeService recipes;
	private final CookbookService cookbooks;
	private final CookbookAuthorRepository cookbookAuthors;
	private final MediaService media;
	private final BlobStore blobs;
	private final JdbcTemplate jdbc;
	private final ObjectMapper json;

	public DemoSeeder(AccountService accounts, RecipeService recipes, CookbookService cookbooks,
			CookbookAuthorRepository cookbookAuthors, MediaService media, BlobStore blobs, JdbcTemplate jdbc,
			ObjectMapper json) {
		this.accounts = accounts;
		this.recipes = recipes;
		this.cookbooks = cookbooks;
		this.cookbookAuthors = cookbookAuthors;
		this.media = media;
		this.blobs = blobs;
		this.jdbc = jdbc;
		this.json = json;
	}

	@EventListener(ApplicationReadyEvent.class)
	void onReady() {
		seedSafely(FIXTURE);
		// decoding the photos grows the heap well past what the running app needs; hand it back so the demo does
		// not push a small container (the default limit is 1 GiB) towards its memory limit
		System.gc();
	}

	/** Seeds, logging instead of throwing; on failure the demo is left empty (503 on its session endpoint). */
	void seedSafely(String fixturePath) {
		try {
			seed(fixturePath);
		}
		catch (RuntimeException e) {
			log.error("Demo seeding failed; the demo site stays unavailable (main site is unaffected)", e);
			try {
				SiteContext.runAs(Site.DEMO, () -> jdbc.execute("truncate table app_user cascade"));
			}
			catch (RuntimeException cleanup) {
				log.error("Could not empty the half-seeded demo database", cleanup);
			}
		}
	}

	public void seed() {
		seed(FIXTURE);
	}

	void seed(String fixturePath) {
		long start = System.currentTimeMillis();
		DemoFixture fixture = read(fixturePath, DemoFixture.class);
		Map<String, DemoPhoto> photos = readPhotos();
		boolean bound = RequestContextHolder.getRequestAttributes() == null;
		if (bound) {
			RequestContextHolder.setRequestAttributes(new ServletRequestAttributes(SeedRequest.create()));
		}
		try {
			SiteContext.runAs(Site.DEMO, () -> {
				blobs.deleteByPrefix(Site.DEMO.blobPrefix());
				seedAll(fixture, photos);
			});
		}
		finally {
			if (bound) {
				RequestContextHolder.resetRequestAttributes();
			}
		}
		log.info("Demo seeded: {} recipes, {} cookbooks in {} ms", fixture.recipes().size(),
				fixture.cookbooks().size(), System.currentTimeMillis() - start);
	}

	private void seedAll(DemoFixture fixture, Map<String, DemoPhoto> photos) {
		// The instance counts as set up, so the demo never offers the first-run admin form.
		jdbc.update("insert into instance_setup (id, completed_at) values (1, ?) on conflict (id) do nothing",
				OffsetDateTime.now());
		Map<String, UUID> userIds = new HashMap<>();
		for (DemoFixture.User u : fixture.users()) {
			// Nobody logs in with a password on the demo (auto sign-in), so it is random and thrown away.
			UUID id = accounts.create(new NewAccountRequest(u.username() + "@demo.invalid",
					UUID.randomUUID() + "-" + UUID.randomUUID(), u.username(), u.displayName()), false).getId();
			userIds.put(u.username(), id);
			if (u.avatar() != null) {
				byte[] avatar = resource("/demo/" + u.avatar());
				accounts.setAvatar(id, () -> avatar);
			}
		}
		Map<String, UUID> recipeIds = new HashMap<>();
		for (DemoFixture.Recipe r : fixture.recipes()) {
			recipeIds.put(r.key(), seedRecipe(r, userIds.get(r.author()), photos));
		}
		for (DemoFixture.Cookbook c : fixture.cookbooks()) {
			seedCookbook(c, userIds, recipeIds, photos);
		}
	}

	private UUID seedRecipe(DemoFixture.Recipe r, UUID authorId, Map<String, DemoPhoto> photos) {
		RecipeDto draft = recipes.create(authorId);
		String cover = recipes.addPhoto(authorId, draft.id(), media.process(() -> image(r.photo(), photos),
				PHOTO_VARIANTS)).mediaId();
		List<GroupDto> groups = r.groups().stream().map(g -> new GroupDto(g.name(), g.ingredients().stream()
			.map(i -> new IngredientDto(i.amount(), i.unit(), i.name(), i.note())).toList())).toList();
		List<StepInput> steps = r.steps().stream().map(s -> new StepInput(s.text(), null)).toList();
		RecipeDto saved = recipes.update(authorId, draft.id(), new RecipeInput(draft.version(), r.title(),
				r.portions(), r.prepMinutes(), r.cookMinutes(), null, r.notes(), r.visibility(), cover, groups, steps));
		if (r.published()) {
			recipes.publish(authorId, draft.id(), saved.version());
		}
		return draft.id();
	}

	private void seedCookbook(DemoFixture.Cookbook c, Map<String, UUID> userIds, Map<String, UUID> recipeIds,
			Map<String, DemoPhoto> photos) {
		UUID ownerId = userIds.get(c.owner());
		CookbookDto created = cookbooks.create(ownerId, new CookbookInput(c.name(), c.description(), c.visibility()));
		cookbooks.setCover(ownerId, created.id(), media.process(() -> image(c.cover(), photos), PHOTO_VARIANTS));
		// Co-authors are added directly: the invite flow needs a second signed-in user, which seeding does not have.
		for (String author : c.authors()) {
			cookbookAuthors.save(new CookbookAuthor(created.id(), userIds.get(author)));
		}
		for (String key : c.recipes()) {
			cookbooks.addRecipe(ownerId, created.id(), new RecipeRef(recipeIds.get(key), null));
		}
	}

	private byte[] image(String ref, Map<String, DemoPhoto> photos) {
		DemoPhoto photo = photos.get(ref);
		if (photo == null) {
			throw new IllegalStateException("No photo entry for " + ref);
		}
		return resource("/demo/images/" + photo.file());
	}

	private Map<String, DemoPhoto> readPhotos() {
		return json.readValue(resource(PHOTOS), json.getTypeFactory()
			.constructMapType(HashMap.class, String.class, DemoPhoto.class));
	}

	private <T> T read(String path, Class<T> type) {
		return json.readValue(resource(path), type);
	}

	private static byte[] resource(String path) {
		try (InputStream in = DemoSeeder.class.getResourceAsStream(path)) {
			if (in == null) {
				throw new IllegalStateException("Missing demo resource " + path);
			}
			return in.readAllBytes();
		}
		catch (IOException e) {
			throw new UncheckedIOException(e);
		}
	}

	/** One entry of photos.json; only the file is needed here, the rest is attribution. */
	record DemoPhoto(String file) {
	}
}

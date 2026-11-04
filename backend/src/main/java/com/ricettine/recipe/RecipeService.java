package com.ricettine.recipe;

import com.ricettine.account.User;
import com.ricettine.account.UserRepository;
import com.ricettine.common.ApiException;
import com.ricettine.common.PublicUrls;
import com.ricettine.common.Tokens;
import com.ricettine.cookbook.CookbookDtos.RecipeRef;
import com.ricettine.media.ImageVariant;
import com.ricettine.media.MediaKind;
import com.ricettine.media.MediaRepository;
import com.ricettine.media.MediaService;
import com.ricettine.media.ProcessedUpload;
import com.ricettine.recipe.RecipeDtos.GroupDto;
import com.ricettine.recipe.RecipeDtos.IngredientDto;
import com.ricettine.recipe.RecipeDtos.PhotoDto;
import com.ricettine.recipe.RecipeDtos.AuthorDto;
import com.ricettine.recipe.RecipeDtos.PublicRecipe;
import com.ricettine.recipe.RecipeDtos.PublicStepDto;
import com.ricettine.recipe.RecipeDtos.RecipeDto;
import com.ricettine.recipe.RecipeDtos.RecipeInput;
import com.ricettine.recipe.RecipeDtos.RecipeSummary;
import com.ricettine.recipe.RecipeDtos.StepDto;
import java.math.BigDecimal;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@Transactional
public class RecipeService {

	private final RecipeRepository recipes;
	private final MediaService media;
	private final MediaRepository mediaRows;

	private final UserRepository users;
	private final PublicUrls urls;

	public RecipeService(RecipeRepository recipes, MediaService media, MediaRepository mediaRows,
			UserRepository users, PublicUrls urls) {
		this.users = users;
		this.urls = urls;
		this.recipes = recipes;
		this.media = media;
		this.mediaRows = mediaRows;
	}

	public RecipeDto create(UUID authorId) {
		return toDto(recipes.saveAndFlush(Recipe.newDraft(authorId, Tokens.newToken())));
	}

	@Transactional(readOnly = true)
	public RecipeDto get(UUID authorId, UUID id) {
		return toDto(owned(authorId, id));
	}

	@Transactional(readOnly = true)
	public List<RecipeSummary> mine(UUID authorId) {
		return recipes.findByAuthorIdOrderByUpdatedAtDescIdAsc(authorId).stream()
			.map(r -> new RecipeSummary(r.getId(), r.getTitle(), r.getStatus().name(), r.getVisibility().name(),
					r.getCoverMediaId() == null ? null : media.url(r.getCoverMediaId(), ImageVariant.THUMB),
					r.getUpdatedAt()))
			.toList();
	}

	/** Cheap author-scoped check, run before an upload is processed so a non-owner can't use processing slots. */
	@Transactional(readOnly = true)
	public void requireOwned(UUID authorId, UUID id) {
		if (!recipes.existsByIdAndAuthorId(id, authorId)) {
			throw new ApiException(HttpStatus.NOT_FOUND, "recipe_not_found");
		}
	}

	/**
	 * Registers an already processed photo for the author's recipe. The recipe is share-locked so a concurrent
	 * delete either sees this photo (and deletes it) or has already removed the recipe (404). The photo is not
	 * referenced until a save puts its id in the cover or a step.
	 */
	public PhotoDto addPhoto(UUID authorId, UUID id, ProcessedUpload upload) {
		Recipe r = recipes.findForShareByIdAndAuthorId(id, authorId)
			.orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "recipe_not_found"));
		return photo(media.register(upload, authorId, MediaKind.RECIPE, r.getId()));
	}

	/**
	 * Whole-document save. Precedence: not owner (404), stale version (409), validation (400), photo reference
	 * (400), incomplete (400). Photos referenced before the save and by nothing after it are deleted (blobs after
	 * commit).
	 */
	public RecipeDto update(UUID authorId, UUID id, RecipeInput in) {
		Recipe r = ownedForUpdate(authorId, id);
		checkVersion(r, in.version());
		Map<String, String> errors = RecipeValidator.validate(in);
		if (!errors.isEmpty()) {
			boolean unit = errors.containsValue(RecipeValidator.INVALID_UNIT);
			throw new ApiException(HttpStatus.BAD_REQUEST, unit ? "invalid_unit" : "validation_failed", errors);
		}
		Set<String> after = referenced(in);
		if (!after.isEmpty()) {
			Set<String> ok = new java.util.HashSet<>(mediaRows.recipeMediaIdsAmong(r.getId(), after));
			List<String> bad = after.stream().filter((m) -> !ok.contains(m)).sorted().toList();
			if (!bad.isEmpty()) {
				throw new ApiException(HttpStatus.BAD_REQUEST, "photo_not_in_recipe").with("mediaIds", bad);
			}
		}
		if (r.getStatus() == RecipeStatus.PUBLISHED) {
			requireComplete(RecipeValidator.missingForPublish(in));
		}
		Set<String> removed = referenced(r);
		removed.removeAll(after);
		apply(r, in);
		r.touch();
		RecipeDto dto = toDto(recipes.saveAndFlush(r));
		media.deleteAll(removed);
		return dto;
	}

	public RecipeDto publish(UUID authorId, UUID id, Long version) {
		Recipe r = ownedForUpdate(authorId, id);
		checkVersion(r, version);
		List<String> names = r.getGroups().stream().flatMap(g -> g.getIngredients().stream())
			.map(Ingredient::getName).toList();
		List<RecipeDtos.StepInput> steps = r.getSteps().stream()
			.map(s -> new RecipeDtos.StepInput(s.getText(), s.getPhotoMediaId())).toList();
		requireComplete(RecipeValidator.missingForPublish(r.getTitle(), names, steps));
		r.publish();
		r.touch();
		return toDto(recipes.saveAndFlush(r));
	}

	/**
	 * New share token (old link and old photo URLs stop working); a change to the recipe, so it bumps version.
	 * {@code version} must be current (409 otherwise), so a reset never lets a stale working copy save on top.
	 */
	public RecipeDto resetShareLink(UUID authorId, UUID id, Long version) {
		Recipe r = ownedForUpdate(authorId, id);
		checkVersion(r, version);
		r.resetShareToken(Tokens.newToken());
		r.touch();
		return toDto(recipes.saveAndFlush(r));
	}

	/** Reader view by share token; unknown token and draft are indistinguishable (404). */
	@Transactional(readOnly = true)
	public PublicRecipe publicByToken(String token, UUID viewerId) {
		Recipe r = recipes.findByShareTokenAndStatus(token, RecipeStatus.PUBLISHED)
			.orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "recipe_not_found"));
		return publicView(r, "?s=" + URLEncoder.encode(token, StandardCharsets.UTF_8), viewerId);
	}

	/** Reader view of a PUBLISHED recipe reached through a cookbook; the caller has checked the entry. */
	@Transactional(readOnly = true)
	public PublicRecipe publishedPublicView(UUID id, String photoQuery, UUID viewerId) {
		Recipe r = recipes.findById(id).filter(x -> x.getStatus() == RecipeStatus.PUBLISHED)
			.orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "recipe_not_found"));
		return publicView(r, photoQuery, viewerId);
	}

	private PublicRecipe publicView(Recipe r, String s, UUID viewerId) {
		User a = users.findById(r.getAuthorId())
			.orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "recipe_not_found"));
		AuthorDto author = new AuthorDto(a.getUsername(), a.getDisplayName(),
				a.getAvatarKey() == null ? null : media.url(a.getAvatarKey(), ImageVariant.AVATAR));
		List<PublicStepDto> steps = r.getSteps().stream()
			.map(st -> new PublicStepDto(st.getText(), photo(st.getPhotoMediaId(), s))).toList();
		boolean viewerIsAuthor = viewerId != null && viewerId.equals(r.getAuthorId());
		return new PublicRecipe(r.getTitle(), author, r.getPortions(), r.getPrepMinutes(), r.getCookMinutes(),
				r.getSource(), r.getNotes(), photo(r.getCoverMediaId(), s), groups(r), steps, r.getPublishedAt(),
				viewerIsAuthor, viewerIsAuthor ? r.getId() : null);
	}

	/**
	 * The recipe a cookbook may take for {@code ref}: PUBLISHED, and reachable by its share token, or by id when the
	 * viewer is its author or it is PUBLIC. Exactly one ref field must be set (400); anything else, drafts
	 * included, is 404.
	 */
	@Transactional(readOnly = true)
	public UUID resolveAddable(RecipeRef ref, UUID viewerId) {
		String token = RecipeValidator.clean(ref.shareToken());
		if ((ref.recipeId() == null) == (token == null)) {
			String code = ref.recipeId() == null ? RecipeValidator.REQUIRED : RecipeValidator.INVALID;
			throw new ApiException(HttpStatus.BAD_REQUEST, "validation_failed",
					Map.of("recipeId", code, "shareToken", code));
		}
		Recipe r = (token != null ? recipes.findByShareTokenAndStatus(token, RecipeStatus.PUBLISHED)
				: recipes.findById(ref.recipeId())
					.filter(x -> x.getStatus() == RecipeStatus.PUBLISHED
							&& (viewerId.equals(x.getAuthorId()) || x.getVisibility() == Visibility.PUBLIC)))
			.orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "recipe_not_found"));
		return r.getId();
	}

	/** Deletes the recipe and all its photos (blobs after commit). A given {@code version} must be current (409). */
	public void delete(UUID authorId, UUID id, Long version) {
		Recipe r = ownedForUpdate(authorId, id);
		if (version != null && r.getVersion() != version) {
			throw new ApiException(HttpStatus.CONFLICT, "recipe_conflict");
		}
		List<String> photos = mediaRows.recipeMediaIds(r.getId());
		recipes.delete(r);
		recipes.flush();
		media.deleteAll(photos);
	}

	/** Media ids the input references (cover and step photos). */
	private static Set<String> referenced(RecipeInput in) {
		Set<String> ids = new HashSet<>();
		if (RecipeValidator.clean(in.coverMediaId()) != null) {
			ids.add(RecipeValidator.clean(in.coverMediaId()));
		}
		if (in.steps() != null) {
			in.steps().stream().filter(s -> s != null && RecipeValidator.clean(s.photoMediaId()) != null)
				.forEach(s -> ids.add(RecipeValidator.clean(s.photoMediaId())));
		}
		return ids;
	}

	/** Media ids the stored recipe references (cover and step photos). */
	private static Set<String> referenced(Recipe r) {
		Set<String> ids = new LinkedHashSet<>();
		if (r.getCoverMediaId() != null) {
			ids.add(r.getCoverMediaId());
		}
		r.getSteps().stream().filter(s -> s.getPhotoMediaId() != null).forEach(s -> ids.add(s.getPhotoMediaId()));
		return ids;
	}

	private Recipe owned(UUID authorId, UUID id) {
		return recipes.findByIdAndAuthorId(id, authorId)
			.orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "recipe_not_found"));
	}

	private Recipe ownedForUpdate(UUID authorId, UUID id) {
		return recipes.findForUpdateByIdAndAuthorId(id, authorId)
			.orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "recipe_not_found"));
	}

	private static void checkVersion(Recipe r, Long version) {
		if (version == null) {
			throw new ApiException(HttpStatus.BAD_REQUEST, "validation_failed",
					Map.of("version", RecipeValidator.REQUIRED));
		}
		if (r.getVersion() != version) {
			throw new ApiException(HttpStatus.CONFLICT, "recipe_conflict");
		}
	}

	private static void requireComplete(Set<String> missing) {
		if (!missing.isEmpty()) {
			Map<String, String> fields = new LinkedHashMap<>();
			missing.forEach(m -> fields.put(m, RecipeValidator.REQUIRED));
			throw new ApiException(HttpStatus.BAD_REQUEST, "recipe_incomplete", fields);
		}
	}

	private static void apply(Recipe r, RecipeInput in) {
		r.setTitle(RecipeValidator.clean(in.title()));
		r.setPortions(in.portions());
		r.setPrepMinutes(in.prepMinutes());
		r.setCookMinutes(in.cookMinutes());
		r.setSource(RecipeValidator.clean(in.source()));
		r.setNotes(RecipeValidator.clean(in.notes()));
		r.setVisibility(Visibility.valueOf(in.visibility()));
		r.setCoverMediaId(RecipeValidator.clean(in.coverMediaId()));
		r.getGroups().clear();
		r.getSteps().clear();
		int gp = 0;
		for (GroupDto g : in.groups() == null ? List.<GroupDto>of() : in.groups()) {
			if (RecipeValidator.isDroppedGroup(g)) {
				continue;
			}
			IngredientGroup group = new IngredientGroup(gp++, RecipeValidator.clean(g.name()));
			int ip = 0;
			for (IngredientDto i : g.ingredients() == null ? List.<IngredientDto>of() : g.ingredients()) {
				group.getIngredients().add(new Ingredient(ip++, normalize(i.amount()),
						RecipeValidator.clean(i.unit()), RecipeValidator.clean(i.name()),
						RecipeValidator.clean(i.note())));
			}
			r.getGroups().add(group);
		}
		int sp = 0;
		for (var s : in.steps() == null ? List.<RecipeDtos.StepInput>of() : in.steps()) {
			String text = RecipeValidator.clean(s.text());
			r.getSteps().add(new Step(sp++, text == null ? "" : text, RecipeValidator.clean(s.photoMediaId())));
		}
	}

	private static BigDecimal normalize(BigDecimal a) {
		if (a == null) {
			return null;
		}
		BigDecimal n = a.stripTrailingZeros();
		return n.scale() < 0 ? n.setScale(0) : n;
	}

	private PhotoDto photo(String mediaId) {
		return photo(mediaId, "");
	}

	private PhotoDto photo(String mediaId, String query) {
		return mediaId == null ? null
				: new PhotoDto(mediaId, media.url(mediaId, ImageVariant.THUMB) + query,
						media.url(mediaId, ImageVariant.DISPLAY) + query);
	}

	private static List<GroupDto> groups(Recipe r) {
		return r.getGroups().stream()
			.map(g -> new GroupDto(g.getName(), g.getIngredients().stream()
				.map(i -> new IngredientDto(normalize(i.getAmount()), i.getUnit(), i.getName(), i.getNote()))
				.toList()))
			.toList();
	}

	private RecipeDto toDto(Recipe r) {
		List<StepDto> steps = r.getSteps().stream().map(s -> new StepDto(s.getText(), photo(s.getPhotoMediaId())))
			.toList();
		return new RecipeDto(r.getId(), r.getStatus().name(), r.getVisibility().name(), r.getTitle(),
				r.getPortions(), r.getPrepMinutes(), r.getCookMinutes(), r.getSource(), r.getNotes(), photo(r.getCoverMediaId()), groups(r),
				steps, r.getVersion(),
				r.getStatus() == RecipeStatus.PUBLISHED ? urls.base() + "/r/" + r.getShareToken() : null, r.getCreatedAt(), r.getUpdatedAt(), r.getPublishedAt());
	}
}

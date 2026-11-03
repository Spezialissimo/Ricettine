package com.ricettine.recipe;

import com.ricettine.common.ApiException;
import com.ricettine.common.Tokens;
import com.ricettine.recipe.RecipeDtos.GroupDto;
import com.ricettine.recipe.RecipeDtos.IngredientDto;
import com.ricettine.recipe.RecipeDtos.RecipeDto;
import com.ricettine.recipe.RecipeDtos.RecipeInput;
import com.ricettine.recipe.RecipeDtos.RecipeSummary;
import com.ricettine.recipe.RecipeDtos.StepDto;
import java.math.BigDecimal;
import java.util.LinkedHashMap;
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

	public RecipeService(RecipeRepository recipes) {
		this.recipes = recipes;
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
					null, r.getUpdatedAt()))
			.toList();
	}

	/** Whole-document save. Precedence: not owner (404), stale version (409), validation (400), incomplete (400). */
	public RecipeDto update(UUID authorId, UUID id, RecipeInput in) {
		Recipe r = ownedForUpdate(authorId, id);
		checkVersion(r, in.version());
		Map<String, String> errors = RecipeValidator.validate(in);
		if (!errors.isEmpty()) {
			boolean unit = errors.containsValue(RecipeValidator.INVALID_UNIT);
			throw new ApiException(HttpStatus.BAD_REQUEST, unit ? "invalid_unit" : "validation_failed", errors);
		}
		// Photos arrive with the media endpoints; until then no photo may be referenced.
		boolean photo = in.coverMediaId() != null
				|| (in.steps() != null && in.steps().stream().anyMatch(s -> s != null && s.photoMediaId() != null));
		if (photo) {
			throw new ApiException(HttpStatus.BAD_REQUEST, "photo_not_in_recipe");
		}
		if (r.getStatus() == RecipeStatus.PUBLISHED) {
			requireComplete(RecipeValidator.missingForPublish(in));
		}
		apply(r, in);
		r.touch();
		return toDto(recipes.saveAndFlush(r));
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

	public void delete(UUID authorId, UUID id) {
		recipes.delete(owned(authorId, id));
		recipes.flush();
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
		r.setCoverMediaId(null);
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
			r.getSteps().add(new Step(sp++, text == null ? "" : text, null));
		}
	}

	private static BigDecimal normalize(BigDecimal a) {
		if (a == null) {
			return null;
		}
		BigDecimal n = a.stripTrailingZeros();
		return n.scale() < 0 ? n.setScale(0) : n;
	}

	private static RecipeDto toDto(Recipe r) {
		List<GroupDto> groups = r.getGroups().stream()
			.map(g -> new GroupDto(g.getName(), g.getIngredients().stream()
				.map(i -> new IngredientDto(normalize(i.getAmount()), i.getUnit(), i.getName(), i.getNote()))
				.toList()))
			.toList();
		List<StepDto> steps = r.getSteps().stream().map(s -> new StepDto(s.getText(), null)).toList();
		return new RecipeDto(r.getId(), r.getStatus().name(), r.getVisibility().name(), r.getTitle(),
				r.getPortions(), r.getPrepMinutes(), r.getCookMinutes(), r.getSource(), r.getNotes(), null, groups,
				steps, r.getVersion(), null, r.getCreatedAt(), r.getUpdatedAt(), r.getPublishedAt());
	}
}

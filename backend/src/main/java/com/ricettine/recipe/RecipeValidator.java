package com.ricettine.recipe;

import com.ricettine.recipe.RecipeDtos.GroupDto;
import com.ricettine.recipe.RecipeDtos.IngredientDto;
import com.ricettine.recipe.RecipeDtos.RecipeInput;
import com.ricettine.recipe.RecipeDtos.StepInput;
import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.Collection;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

/** Recipe limits and the publish-completeness rule. Field keys are dotted paths, e.g. {@code steps[3].text}. */
public final class RecipeValidator {

	static final int MAX_TITLE = 200;
	static final int MAX_MINUTES = 10080;
	static final int MAX_SOURCE = 500;
	static final int MAX_NOTES = 10_000;
	static final int MAX_GROUPS = 20;
	/** Raw groups (empty ones included) accepted before anything is iterated. */
	static final int MAX_RAW_GROUPS = 1000;
	static final int MAX_GROUP_NAME = 100;
	static final int MAX_INGREDIENTS = 200;
	static final int MAX_INGREDIENT_NAME = 200;
	static final int MAX_INGREDIENT_NOTE = 200;
	static final int MAX_STEPS = 100;
	static final int MAX_STEP_TEXT = 5000;
	static final BigDecimal MAX_AMOUNT = new BigDecimal("1000000");

	public static final String TOO_LONG = "too_long";
	public static final String OUT_OF_RANGE = "out_of_range";
	public static final String REQUIRED = "required";
	public static final String TOO_MANY = "too_many";
	public static final String INVALID = "invalid";
	public static final String INVALID_UNIT = "invalid_unit";

	private RecipeValidator() {
	}

	/** Trims; blank becomes null. */
	static String clean(String s) {
		if (s == null) {
			return null;
		}
		String t = s.strip();
		return t.isEmpty() ? null : t;
	}

	static boolean isDroppedGroup(GroupDto g) {
		return clean(g.name()) == null && (g.ingredients() == null || g.ingredients().isEmpty());
	}

	/** Validates the raw input (paths use the client's indices) and returns field to error code; empty when valid. */
	public static Map<String, String> validate(RecipeInput in) {
		Map<String, String> e = new LinkedHashMap<>();
		String title = clean(in.title());
		if (title != null && title.length() > MAX_TITLE) {
			e.put("title", TOO_LONG);
		}
		if (in.version() == null) {
			e.put("version", REQUIRED);
		}
		if (in.portions() < 1 || in.portions() > 100) {
			e.put("portions", OUT_OF_RANGE);
		}
		minutes(e, "prepMinutes", in.prepMinutes());
		minutes(e, "cookMinutes", in.cookMinutes());
		String source = clean(in.source());
		if (source != null && source.length() > MAX_SOURCE) {
			e.put("source", TOO_LONG);
		}
		String notes = clean(in.notes());
		if (notes != null && notes.length() > MAX_NOTES) {
			e.put("notes", TOO_LONG);
		}
		if (in.visibility() == null || !isVisibility(in.visibility())) {
			e.put("visibility", INVALID);
		}
		List<GroupDto> groups = in.groups() == null ? List.of() : in.groups();
		if (groups.size() > MAX_RAW_GROUPS) {
			e.put("groups", TOO_MANY);
			groups = List.of();
		}
		int keptGroups = 0;
		int ingredients = 0;
		for (int g = 0; g < groups.size(); g++) {
			GroupDto group = groups.get(g);
			if (group == null) {
				e.put("groups[" + g + "]", REQUIRED);
				continue;
			}
			if (isDroppedGroup(group)) {
				continue;
			}
			keptGroups++;
			String gn = clean(group.name());
			if (gn != null && gn.length() > MAX_GROUP_NAME) {
				e.put("groups[" + g + "].name", TOO_LONG);
			}
			List<IngredientDto> items = group.ingredients() == null ? List.of() : group.ingredients();
			ingredients += items.size();
			for (int i = 0; i < items.size(); i++) {
				ingredient(e, "groups[" + g + "].ingredients[" + i + "]", items.get(i));
			}
		}
		if (keptGroups > MAX_GROUPS) {
			e.put("groups", TOO_MANY);
		}
		if (ingredients > MAX_INGREDIENTS) {
			e.put("ingredients", TOO_MANY);
		}
		List<StepInput> steps = in.steps() == null ? List.of() : in.steps();
		if (steps.size() > MAX_STEPS) {
			e.put("steps", TOO_MANY);
		}
		for (int s = 0; s < steps.size(); s++) {
			StepInput step = steps.get(s);
			if (step == null) {
				e.put("steps[" + s + "]", REQUIRED);
			}
			else if (clean(step.text()) != null && clean(step.text()).length() > MAX_STEP_TEXT) {
				e.put("steps[" + s + "].text", TOO_LONG);
			}
		}
		return e;
	}

	private static void minutes(Map<String, String> e, String field, Integer v) {
		if (v != null && (v < 0 || v > MAX_MINUTES)) {
			e.put(field, OUT_OF_RANGE);
		}
	}

	private static boolean isVisibility(String v) {
		for (Visibility x : Visibility.values()) {
			if (x.name().equals(v)) {
				return true;
			}
		}
		return false;
	}

	private static void ingredient(Map<String, String> e, String path, IngredientDto i) {
		if (i == null) {
			e.put(path, REQUIRED);
			return;
		}
		String name = clean(i.name());
		if (name == null) {
			e.put(path + ".name", REQUIRED);
		}
		else if (name.length() > MAX_INGREDIENT_NAME) {
			e.put(path + ".name", TOO_LONG);
		}
		String note = clean(i.note());
		if (note != null && note.length() > MAX_INGREDIENT_NOTE) {
			e.put(path + ".note", TOO_LONG);
		}
		BigDecimal a = i.amount();
		if (a != null) {
			if (a.signum() <= 0 || a.compareTo(MAX_AMOUNT) > 0 || a.stripTrailingZeros().scale() > 3) {
				e.put(path + ".amount", OUT_OF_RANGE);
			}
		}
		String unit = clean(i.unit());
		if (unit != null && !Unit.isValid(unit)) {
			e.put(path + ".unit", INVALID_UNIT);
		}
	}

	/**
	 * The one publish-completeness rule: a non-blank title, at least one ingredient with a non-blank name, and at
	 * least one step with non-blank text or a photo. Returns a subset of {title, ingredients, steps}.
	 */
	public static Set<String> missingForPublish(String title, Collection<String> ingredientNames,
			Collection<StepInput> steps) {
		Set<String> missing = new LinkedHashSet<>();
		if (clean(title) == null) {
			missing.add("title");
		}
		if (ingredientNames.stream().noneMatch(n -> clean(n) != null)) {
			missing.add("ingredients");
		}
		if (steps.stream().noneMatch(s -> s != null && (clean(s.text()) != null || clean(s.photoMediaId()) != null))) {
			missing.add("steps");
		}
		return missing;
	}

	public static Set<String> missingForPublish(RecipeInput in) {
		List<String> names = new ArrayList<>();
		if (in.groups() != null) {
			for (GroupDto g : in.groups()) {
				if (g != null && g.ingredients() != null) {
					g.ingredients().stream().filter(i -> i != null).forEach(i -> names.add(i.name()));
				}
			}
		}
		return missingForPublish(in.title(), names, in.steps() == null ? List.of() : in.steps());
	}
}

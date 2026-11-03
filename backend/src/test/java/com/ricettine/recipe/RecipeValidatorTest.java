package com.ricettine.recipe;

import static org.assertj.core.api.Assertions.assertThat;

import com.ricettine.recipe.RecipeDtos.GroupDto;
import com.ricettine.recipe.RecipeDtos.IngredientDto;
import com.ricettine.recipe.RecipeDtos.RecipeInput;
import com.ricettine.recipe.RecipeDtos.StepInput;
import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Set;
import org.junit.jupiter.api.Test;

class RecipeValidatorTest {

	static RecipeInput input(String title, int portions, List<GroupDto> groups, List<StepInput> steps) {
		return new RecipeInput(0, title, portions, null, null, null, null, "PRIVATE", null, groups, steps);
	}

	static RecipeInput ok() {
		return input("Pasta", 2, List.of(group(ing(BigDecimal.ONE, "kg", "flour"))), List.of(new StepInput("Mix", null)));
	}

	static IngredientDto ing(BigDecimal amount, String unit, String name) {
		return new IngredientDto(amount, unit, name, null);
	}

	static GroupDto group(IngredientDto... items) {
		return new GroupDto(null, List.of(items));
	}

	static RecipeInput withIngredient(IngredientDto i) {
		return input("Pasta", 1, List.of(group(i)), List.of());
	}

	@Test
	void validRecipeHasNoErrors() {
		assertThat(RecipeValidator.validate(ok())).isEmpty();
	}

	@Test
	void titleBoundary() {
		assertThat(RecipeValidator.validate(input("a".repeat(200), 1, List.of(), List.of()))).isEmpty();
		assertThat(RecipeValidator.validate(input("a".repeat(201), 1, List.of(), List.of())))
			.containsOnlyKeys("title");
	}

	@Test
	void portionsBoundary() {
		assertThat(RecipeValidator.validate(input("t", 1, List.of(), List.of()))).isEmpty();
		assertThat(RecipeValidator.validate(input("t", 100, List.of(), List.of()))).isEmpty();
		assertThat(RecipeValidator.validate(input("t", 0, List.of(), List.of()))).containsOnlyKeys("portions");
		assertThat(RecipeValidator.validate(input("t", 101, List.of(), List.of()))).containsOnlyKeys("portions");
	}

	@Test
	void amountBoundaries() {
		assertThat(RecipeValidator.validate(withIngredient(ing(null, null, "salt")))).isEmpty();
		assertThat(RecipeValidator.validate(withIngredient(ing(new BigDecimal("0.001"), null, "x")))).isEmpty();
		assertThat(RecipeValidator.validate(withIngredient(ing(new BigDecimal("1000000"), null, "x")))).isEmpty();
		assertThat(RecipeValidator.validate(withIngredient(ing(BigDecimal.ZERO, null, "x"))))
			.containsOnlyKeys("groups[0].ingredients[0].amount");
		assertThat(RecipeValidator.validate(withIngredient(ing(new BigDecimal("-1"), null, "x"))))
			.containsOnlyKeys("groups[0].ingredients[0].amount");
		assertThat(RecipeValidator.validate(withIngredient(ing(new BigDecimal("1000000.0001"), null, "x"))))
			.containsOnlyKeys("groups[0].ingredients[0].amount");
		assertThat(RecipeValidator.validate(withIngredient(ing(new BigDecimal("0.0001"), null, "x"))))
			.containsOnlyKeys("groups[0].ingredients[0].amount");
		assertThat(RecipeValidator.validate(withIngredient(ing(new BigDecimal("1.5000"), null, "x")))).isEmpty();
	}

	@Test
	void stepCountBoundaryAndNestedPath() {
		List<StepInput> steps = new ArrayList<>();
		for (int i = 0; i < 100; i++) {
			steps.add(new StepInput("s", null));
		}
		assertThat(RecipeValidator.validate(input("t", 1, List.of(), steps))).isEmpty();
		steps.add(new StepInput("s", null));
		assertThat(RecipeValidator.validate(input("t", 1, List.of(), steps))).containsOnlyKeys("steps");
		List<StepInput> one = List.of(new StepInput("s", null), new StepInput("x".repeat(5001), null));
		assertThat(RecipeValidator.validate(input("t", 1, List.of(), one))).containsOnlyKeys("steps[1].text");
	}

	@Test
	void unknownUnitIsInvalidUnit() {
		Map<String, String> errors = RecipeValidator.validate(withIngredient(ing(BigDecimal.ONE, "oz", "x")));
		assertThat(errors).containsEntry("groups[0].ingredients[0].unit", "invalid_unit").hasSize(1);
		for (Unit u : Unit.values()) {
			assertThat(RecipeValidator.validate(withIngredient(ing(BigDecimal.ONE, u.code(), "x")))).isEmpty();
		}
	}

	@Test
	void ingredientNameRequiredAndCounts() {
		assertThat(RecipeValidator.validate(withIngredient(ing(null, null, "  "))))
			.containsOnlyKeys("groups[0].ingredients[0].name");
		List<GroupDto> groups = new ArrayList<>();
		for (int g = 0; g < 21; g++) {
			groups.add(group(ing(null, null, "x")));
		}
		assertThat(RecipeValidator.validate(input("t", 1, groups, List.of()))).containsOnlyKeys("groups");
		List<IngredientDto> many = new ArrayList<>();
		for (int i = 0; i < 201; i++) {
			many.add(ing(null, null, "x"));
		}
		assertThat(RecipeValidator.validate(input("t", 1, List.of(new GroupDto(null, many)), List.of())))
			.containsOnlyKeys("ingredients");
	}

	@Test
	void otherLimits() {
		RecipeInput bad = new RecipeInput(0, "t", 1, 10081, -1, "s".repeat(501), "n".repeat(10001), "SECRET", null,
				List.of(new GroupDto("g".repeat(101), List.of())), List.of());
		assertThat(RecipeValidator.validate(bad)).containsOnlyKeys("prepMinutes", "cookMinutes", "source", "notes",
				"visibility", "groups[0].name");
	}

	@Test
	void missingForPublishIsExactlyTheMissingSet() {
		assertThat(RecipeValidator.missingForPublish(ok())).isEmpty();
		assertThat(RecipeValidator.missingForPublish(input(null, 1, List.of(), List.of())))
			.isEqualTo(Set.of("title", "ingredients", "steps"));
		assertThat(RecipeValidator.missingForPublish(input("  ", 1, ok().groups(), ok().steps())))
			.isEqualTo(Set.of("title"));
		assertThat(RecipeValidator.missingForPublish(input("t", 1, List.of(new GroupDto("g", List.of())), ok().steps())))
			.isEqualTo(Set.of("ingredients"));
		assertThat(RecipeValidator.missingForPublish(input("t", 1, ok().groups(), List.of())))
			.isEqualTo(Set.of("steps"));
	}
}

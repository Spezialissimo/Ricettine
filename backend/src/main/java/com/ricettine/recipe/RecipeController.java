package com.ricettine.recipe;

import com.ricettine.auth.CurrentUser;
import com.ricettine.common.ApiException;
import com.ricettine.recipe.RecipeDtos.PublishRequest;
import com.ricettine.recipe.RecipeDtos.RecipeDto;
import com.ricettine.recipe.RecipeDtos.RecipeInput;
import com.ricettine.recipe.RecipeDtos.RecipeSummary;
import java.net.URI;
import java.util.List;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/recipes")
public class RecipeController {

	private final RecipeService recipes;
	private final CurrentUser currentUser;

	public RecipeController(RecipeService recipes, CurrentUser currentUser) {
		this.recipes = recipes;
		this.currentUser = currentUser;
	}

	@PostMapping
	ResponseEntity<RecipeDto> create() {
		RecipeDto dto = recipes.create(currentUser.id());
		return ResponseEntity.created(URI.create("/api/recipes/" + dto.id())).body(dto);
	}

	@GetMapping("/mine")
	List<RecipeSummary> mine() {
		return recipes.mine(currentUser.id());
	}

	@GetMapping("/{id}")
	RecipeDto get(@PathVariable String id) {
		return recipes.get(currentUser.id(), parse(id));
	}

	@PutMapping("/{id}")
	RecipeDto update(@PathVariable String id, @RequestBody RecipeInput input) {
		return recipes.update(currentUser.id(), parse(id), input);
	}

	@PostMapping("/{id}/publish")
	RecipeDto publish(@PathVariable String id, @RequestBody PublishRequest request) {
		return recipes.publish(currentUser.id(), parse(id), request.version());
	}

	/** {@code version} is optional for now: when given and stale, 409 {@code recipe_conflict}. */
	@DeleteMapping("/{id}")
	ResponseEntity<Void> delete(@PathVariable String id, @RequestParam(required = false) Long version) {
		recipes.delete(currentUser.id(), parse(id), version);
		return ResponseEntity.noContent().build();
	}

	/** A malformed id can't be anyone's recipe: same 404 as an unknown one. */
	static UUID parse(String id) {
		try {
			return UUID.fromString(id);
		}
		catch (IllegalArgumentException e) {
			throw new ApiException(HttpStatus.NOT_FOUND, "recipe_not_found");
		}
	}
}

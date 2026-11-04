package com.ricettine.recipe;

import com.ricettine.auth.CurrentUser;
import com.ricettine.recipe.RecipeDtos.PublicRecipe;
import org.springframework.http.CacheControl;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/** Public, unauthenticated recipe-by-link read. Never cached: a link reset must take effect immediately. */
@RestController
@RequestMapping("/api/r")
public class PublicRecipeController {

	private final RecipeService recipes;
	private final CurrentUser currentUser;

	public PublicRecipeController(RecipeService recipes, CurrentUser currentUser) {
		this.recipes = recipes;
		this.currentUser = currentUser;
	}

	@GetMapping("/{token}")
	ResponseEntity<PublicRecipe> get(@PathVariable String token) {
		return ResponseEntity.ok().cacheControl(CacheControl.noStore())
			.body(recipes.publicByToken(token, currentUser.optionalId().orElse(null)));
	}
}

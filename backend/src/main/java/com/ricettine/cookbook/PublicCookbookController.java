package com.ricettine.cookbook;

import com.ricettine.auth.CurrentUser;
import com.ricettine.cookbook.CookbookDtos.PublicCookbook;
import com.ricettine.recipe.RecipeDtos.PublicRecipe;
import org.springframework.http.CacheControl;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/** Public, unauthenticated cookbook-by-link read. Never cached: a link reset must take effect immediately. */
@RestController
@RequestMapping("/api/c")
public class PublicCookbookController {

	private final CookbookService cookbooks;
	private final CurrentUser currentUser;

	public PublicCookbookController(CookbookService cookbooks, CurrentUser currentUser) {
		this.cookbooks = cookbooks;
		this.currentUser = currentUser;
	}

	@GetMapping("/{token}")
	ResponseEntity<PublicCookbook> get(@PathVariable String token) {
		return ResponseEntity.ok().cacheControl(CacheControl.noStore())
			.body(cookbooks.publicByToken(token, currentUser.optionalId().orElse(null)));
	}

	@GetMapping("/{token}/recipes/{recipeId}")
	ResponseEntity<PublicRecipe> recipe(@PathVariable String token, @PathVariable String recipeId) {
		return ResponseEntity.ok().cacheControl(CacheControl.noStore())
			.body(cookbooks.publicRecipe(token, recipeId, currentUser.optionalId().orElse(null)));
	}
}

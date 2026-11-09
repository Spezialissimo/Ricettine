package com.ricettine.cookbook;

import com.ricettine.auth.CurrentUser;
import com.ricettine.common.ApiException;
import com.ricettine.common.Ids;
import com.ricettine.cookbook.CookbookDtos.CookbookDto;
import com.ricettine.cookbook.CookbookDtos.CookbookEntryDto;
import com.ricettine.cookbook.CookbookDtos.CookbookInput;
import com.ricettine.cookbook.CookbookDtos.CookbookSummary;
import com.ricettine.recipe.RecipeDtos.RecipeRef;
import java.net.URI;
import java.util.List;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/cookbooks")
public class CookbookController {

	private final CookbookService cookbooks;
	private final CurrentUser currentUser;

	public CookbookController(CookbookService cookbooks, CurrentUser currentUser) {
		this.cookbooks = cookbooks;
		this.currentUser = currentUser;
	}

	@PostMapping
	ResponseEntity<CookbookDto> create(@RequestBody CookbookInput input) {
		CookbookDto dto = cookbooks.create(currentUser.id(), input);
		return ResponseEntity.created(URI.create("/api/cookbooks/" + dto.id())).body(dto);
	}

	@GetMapping("/mine")
	List<CookbookSummary> mine() {
		return cookbooks.mine(currentUser.id());
	}

	@GetMapping("/{id}")
	CookbookDto get(@PathVariable String id) {
		return cookbooks.get(currentUser.id(), parse(id));
	}

	@PatchMapping("/{id}")
	CookbookDto update(@PathVariable String id, @RequestBody CookbookInput input) {
		return cookbooks.update(currentUser.id(), parse(id), input);
	}

	@DeleteMapping("/{id}")
	ResponseEntity<Void> delete(@PathVariable String id) {
		cookbooks.delete(currentUser.id(), parse(id));
		return ResponseEntity.noContent().build();
	}

	@PostMapping("/{id}/share-link/reset")
	CookbookDto resetShareLink(@PathVariable String id) {
		return cookbooks.resetShareLink(currentUser.id(), parse(id));
	}

	@PostMapping("/{id}/recipes")
	ResponseEntity<CookbookEntryDto> addRecipe(@PathVariable String id, @RequestBody RecipeRef ref) {
		CookbookService.AddResult r = cookbooks.addRecipe(currentUser.id(), parse(id), ref);
		return ResponseEntity.status(r.created() ? HttpStatus.CREATED : HttpStatus.OK).body(r.entry());
	}

	/** A malformed recipe id can't be an entry, so removing it is the same no-op as an absent one. */
	@DeleteMapping("/{id}/recipes/{recipeId}")
	ResponseEntity<Void> removeRecipe(@PathVariable String id, @PathVariable String recipeId) {
		UUID cookbookId = parse(id);
		UUID recipe = Ids.tryParse(recipeId).orElse(null);
		if (recipe == null) {
			cookbooks.requireMember(cookbookId, currentUser.id());
			return ResponseEntity.noContent().build();
		}
		cookbooks.removeRecipe(currentUser.id(), cookbookId, recipe);
		return ResponseEntity.noContent().build();
	}

	/** A malformed id can't be anyone's cookbook: same 404 as an unknown one. */
	static UUID parse(String id) {
		return Ids.parse(id, "cookbook_not_found");
	}
}

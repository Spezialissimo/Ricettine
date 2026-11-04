package com.ricettine.cookbook;

import com.ricettine.auth.CurrentUser;
import com.ricettine.common.ApiException;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/cookbooks/{id}/authors")
public class CookbookMemberController {

	private final CookbookService cookbooks;
	private final CurrentUser currentUser;

	public CookbookMemberController(CookbookService cookbooks, CurrentUser currentUser) {
		this.cookbooks = cookbooks;
		this.currentUser = currentUser;
	}

	/** Owner removes an author, or an author leaves (userId is themselves). */
	@DeleteMapping("/{userId}")
	@ResponseStatus(HttpStatus.NO_CONTENT)
	void remove(@PathVariable String id, @PathVariable String userId,
			@RequestParam(defaultValue = "false") boolean removeRecipes) {
		UUID cookbookId = CookbookController.parse(id);
		UUID target;
		try {
			target = UUID.fromString(userId);
		}
		catch (IllegalArgumentException e) {
			cookbooks.requireMember(cookbookId, currentUser.id());
			throw new ApiException(HttpStatus.NOT_FOUND, "cookbook_not_found");
		}
		cookbooks.removeAuthor(currentUser.id(), cookbookId, target, removeRecipes);
	}
}

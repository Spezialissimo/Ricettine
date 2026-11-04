package com.ricettine.cookbook;

import com.ricettine.auth.CurrentUser;
import com.ricettine.cookbook.CookbookDtos.CookbookInviteCreated;
import com.ricettine.cookbook.CookbookDtos.CookbookInviteDto;
import com.ricettine.cookbook.CookbookDtos.CookbookInvitePreview;
import com.ricettine.cookbook.CookbookDtos.CookbookSummary;
import com.ricettine.common.ApiException;
import java.util.List;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

/** Co-author invites: owner management and the invitee's preview / accept. All require a session. */
@RestController
public class CookbookInviteController {

	private final CookbookService cookbooks;
	private final CurrentUser currentUser;

	public CookbookInviteController(CookbookService cookbooks, CurrentUser currentUser) {
		this.cookbooks = cookbooks;
		this.currentUser = currentUser;
	}

	@PostMapping("/api/cookbooks/{id}/invites")
	@ResponseStatus(HttpStatus.CREATED)
	CookbookInviteCreated create(@PathVariable String id) {
		return cookbooks.createInvite(currentUser.id(), CookbookController.parse(id));
	}

	@GetMapping("/api/cookbooks/{id}/invites")
	List<CookbookInviteDto> list(@PathVariable String id) {
		return cookbooks.listInvites(currentUser.id(), CookbookController.parse(id));
	}

	@DeleteMapping("/api/cookbooks/{id}/invites/{inviteId}")
	@ResponseStatus(HttpStatus.NO_CONTENT)
	void revoke(@PathVariable String id, @PathVariable String inviteId) {
		UUID cookbookId = CookbookController.parse(id);
		UUID invite;
		try {
			invite = UUID.fromString(inviteId);
		}
		catch (IllegalArgumentException e) {
			cookbooks.requireOwner(cookbookId, currentUser.id());
			throw new ApiException(HttpStatus.NOT_FOUND, "cookbook_invite_invalid");
		}
		cookbooks.revokeInvite(currentUser.id(), cookbookId, invite);
	}

	@GetMapping("/api/cookbook-invites/{token}")
	CookbookInvitePreview preview(@PathVariable String token) {
		return cookbooks.previewInvite(token);
	}

	@PostMapping("/api/cookbook-invites/{token}/accept")
	CookbookSummary accept(@PathVariable String token) {
		return cookbooks.acceptInvite(currentUser.id(), token);
	}
}

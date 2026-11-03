package com.ricettine.invite;

import com.ricettine.auth.CurrentUser;
import java.time.Instant;
import java.util.List;
import java.util.UUID;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.servlet.support.ServletUriComponentsBuilder;

@RestController
public class AdminInviteController {

	public record InviteCreated(UUID id, String url, Instant expiresAt) {
	}

	public record InviteSummary(UUID id, Instant createdAt, Instant expiresAt) {
	}

	private final InviteService invites;
	private final CurrentUser currentUser;
	private final String configuredBaseUrl;

	public AdminInviteController(InviteService invites, CurrentUser currentUser,
			@Value("${ricettine.base-url:}") String configuredBaseUrl) {
		this.invites = invites;
		this.currentUser = currentUser;
		this.configuredBaseUrl = configuredBaseUrl;
	}

	@PostMapping("/api/admin/invites")
	@ResponseStatus(HttpStatus.CREATED)
	public InviteCreated create() {
		var created = invites.create(currentUser.id());
		return new InviteCreated(created.id(), baseUrl() + "/invite/" + created.token(), created.expiresAt());
	}

	@GetMapping("/api/admin/invites")
	public List<InviteSummary> list() {
		return invites.listActive().stream()
			.map(t -> new InviteSummary(t.getId(), t.getCreatedAt(), t.getExpiresAt())).toList();
	}

	@DeleteMapping("/api/admin/invites/{id}")
	@ResponseStatus(HttpStatus.NO_CONTENT)
	public void revoke(@PathVariable UUID id) {
		invites.revoke(id);
	}

	private String baseUrl() {
		String base = configuredBaseUrl.isBlank() ? ServletUriComponentsBuilder.fromCurrentContextPath()
			.build().toUriString() : configuredBaseUrl.trim();
		return base.endsWith("/") ? base.substring(0, base.length() - 1) : base;
	}
}

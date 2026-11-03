package com.ricettine.admin;

import com.ricettine.account.UserRepository;
import com.ricettine.auth.CurrentUser;
import com.ricettine.auth.PasswordResetService;
import com.ricettine.common.PublicUrls;
import java.time.Instant;
import java.util.List;
import java.util.UUID;
import org.springframework.data.domain.Sort;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

@RestController
public class AdminUserController {

	public record UserSummary(UUID id, String username, String displayName, String email, boolean admin,
			Instant createdAt) {
	}

	public record ResetCreated(String url, Instant expiresAt) {
	}

	private final UserRepository users;
	private final PasswordResetService resets;
	private final CurrentUser currentUser;
	private final PublicUrls urls;

	public AdminUserController(UserRepository users, PasswordResetService resets, CurrentUser currentUser,
			PublicUrls urls) {
		this.users = users;
		this.resets = resets;
		this.currentUser = currentUser;
		this.urls = urls;
	}

	@GetMapping("/api/admin/users")
	public List<UserSummary> list() {
		return users.findAll(Sort.by(Sort.Direction.DESC, "createdAt")).stream()
			.map(u -> new UserSummary(u.getId(), u.getUsername(), u.getDisplayName(), u.getEmail(), u.isAdmin(),
					u.getCreatedAt())).toList();
	}

	@PostMapping("/api/admin/users/{id}/password-reset")
	@ResponseStatus(HttpStatus.CREATED)
	public ResetCreated createReset(@PathVariable UUID id) {
		var created = resets.create(currentUser.id(), id);
		return new ResetCreated(urls.base() + "/reset/" + created.token(), created.expiresAt());
	}
}

package com.ricettine.auth;

import com.ricettine.account.User;
import com.ricettine.account.UserRepository;
import com.ricettine.common.ApiException;
import java.util.Optional;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.security.authentication.AnonymousAuthenticationToken;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Component;

@Component
public class CurrentUser {

	private final UserRepository users;

	public CurrentUser(UserRepository users) {
		this.users = users;
	}

	public UUID id() {
		Authentication a = SecurityContextHolder.getContext().getAuthentication();
		if (a == null || a instanceof AnonymousAuthenticationToken || !a.isAuthenticated()) {
			throw notAuthenticated();
		}
		try {
			return UUID.fromString(a.getName());
		}
		catch (IllegalArgumentException e) {
			throw notAuthenticated();
		}
	}

	/** The caller's id, or empty for an anonymous request. */
	public Optional<UUID> optionalId() {
		Authentication a = SecurityContextHolder.getContext().getAuthentication();
		if (a == null || a instanceof AnonymousAuthenticationToken || !a.isAuthenticated()) {
			return Optional.empty();
		}
		try {
			return Optional.of(UUID.fromString(a.getName()));
		}
		catch (IllegalArgumentException e) {
			return Optional.empty();
		}
	}

	public User require() {
		return users.findById(id()).orElseThrow(CurrentUser::notAuthenticated);
	}

	private static ApiException notAuthenticated() {
		return new ApiException(HttpStatus.UNAUTHORIZED, "not_authenticated");
	}
}

package com.ricettine.account;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import java.util.UUID;

public final class AccountDtos {

	private AccountDtos() {
	}

	public record MeDto(UUID id, String email, String username, String displayName, String avatarUrl,
			boolean admin) {

		public static MeDto of(User u) {
			return new MeDto(u.getId(), u.getEmail(), u.getUsername(), u.getDisplayName(), null, u.isAdmin());
		}
	}

	public record NewAccountRequest(@NotNull String email, @NotNull String password, @NotNull String username,
			@NotBlank @Size(max = 80) String displayName) {
	}
}

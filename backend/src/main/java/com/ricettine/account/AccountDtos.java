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
	}

	public record NewAccountRequest(@NotNull String email, @NotNull String password, @NotNull String username,
			@NotBlank @Size(max = 80) String displayName) {
	}

	public record ProfilePatch(String displayName, String username) {
	}

	public record ChangePasswordRequest(@NotNull String currentPassword, @NotNull String newPassword) {
	}

	public record PasswordRequest(@NotNull String password) {
	}

	public record NewPasswordRequest(@NotNull String newPassword) {
	}
}

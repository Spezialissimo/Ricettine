package com.ricettine.auth;

import com.ricettine.account.AccountDtos.NewPasswordRequest;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

@RestController
public class PasswordResetController {

	private final PasswordResetService resets;

	public PasswordResetController(PasswordResetService resets) {
		this.resets = resets;
	}

	@PostMapping("/api/password-resets/{token}")
	@ResponseStatus(HttpStatus.NO_CONTENT)
	public void redeem(@PathVariable String token, @Valid @RequestBody NewPasswordRequest body) {
		resets.redeem(token, body.newPassword());
	}
}

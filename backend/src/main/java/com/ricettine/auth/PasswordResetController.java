package com.ricettine.auth;

import com.ricettine.account.AccountDtos.NewPasswordRequest;
import com.ricettine.common.RateLimits;
import jakarta.servlet.http.HttpServletRequest;
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
	private final RateLimits limits;

	public PasswordResetController(PasswordResetService resets, RateLimits limits) {
		this.limits = limits;
		this.resets = resets;
	}

	@PostMapping("/api/password-resets/{token}")
	@ResponseStatus(HttpStatus.NO_CONTENT)
	public void redeem(@PathVariable String token, @Valid @RequestBody NewPasswordRequest body,
			HttpServletRequest request) {
		limits.anonymousAuth(request.getRemoteAddr());
		resets.redeem(token, body.newPassword());
	}
}

package com.ricettine.account;

import com.ricettine.account.AccountDtos.ChangePasswordRequest;
import com.ricettine.account.AccountDtos.MeDto;
import com.ricettine.account.AccountDtos.PasswordRequest;
import com.ricettine.account.AccountDtos.ProfilePatch;
import com.ricettine.auth.CurrentUser;
import com.ricettine.common.ApiException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpSession;
import jakarta.validation.Valid;
import java.io.IOException;
import java.io.UncheckedIOException;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestPart;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

@RestController
public class MeController {

	private final AccountService accounts;
	private final CurrentUser currentUser;
	private final MeMapper mapper;

	public MeController(AccountService accounts, CurrentUser currentUser, MeMapper mapper) {
		this.accounts = accounts;
		this.currentUser = currentUser;
		this.mapper = mapper;
	}

	@PatchMapping("/api/me")
	public MeDto patch(@RequestBody ProfilePatch body) {
		return mapper.toDto(accounts.updateProfile(currentUser.id(), body));
	}

	@PutMapping("/api/me/password")
	@ResponseStatus(HttpStatus.NO_CONTENT)
	public void changePassword(@Valid @RequestBody ChangePasswordRequest body, HttpServletRequest req) {
		HttpSession session = req.getSession(false);
		accounts.changePassword(currentUser.id(), body.currentPassword(), body.newPassword(),
				session == null ? null : session.getId());
	}

	@PutMapping("/api/me/avatar")
	public MeDto putAvatar(@RequestPart("file") MultipartFile file) {
		byte[] bytes;
		try {
			bytes = file.getBytes();
		}
		catch (IOException e) {
			throw new UncheckedIOException(e);
		}
		return mapper.toDto(accounts.setAvatar(currentUser.id(), bytes));
	}

	@DeleteMapping("/api/me/avatar")
	public MeDto deleteAvatar() {
		return mapper.toDto(accounts.removeAvatar(currentUser.id()));
	}

	@DeleteMapping("/api/me")
	@ResponseStatus(HttpStatus.NO_CONTENT)
	public void deleteAccount(@Valid @RequestBody PasswordRequest body, HttpServletRequest req) {
		User user = currentUser.require();
		accounts.requirePassword(user, body.password());
		accounts.delete(user.getId());
		// The account and its sessions are gone: don't let the response re-save the request's session.
		SecurityContextHolder.clearContext();
		HttpSession session = req.getSession(false);
		if (session != null) {
			try {
				session.invalidate();
			}
			catch (IllegalStateException alreadyInvalid) {
				// already ended
			}
		}
	}
}

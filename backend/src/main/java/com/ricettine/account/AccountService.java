package com.ricettine.account;

import com.ricettine.account.AccountDtos.NewAccountRequest;
import com.ricettine.common.ApiException;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.HttpStatus;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class AccountService {

	private final UserRepository users;
	private final PasswordEncoder encoder;

	public AccountService(UserRepository users, PasswordEncoder encoder) {
		this.users = users;
		this.encoder = encoder;
	}

	@Transactional
	public User create(NewAccountRequest req, boolean admin) {
		String email = Identity.normalizeEmail(req.email());
		String username = Identity.validateUsername(req.username());
		String password = req.password();
		if (password == null || password.length() < 10) {
			throw new ApiException(HttpStatus.BAD_REQUEST, "password_too_short");
		}
		if (password.length() > 128) {
			throw new ApiException(HttpStatus.BAD_REQUEST, "password_too_long");
		}
		String displayName = req.displayName() == null ? "" : req.displayName().trim();
		if (displayName.isEmpty() || displayName.length() > 80) {
			throw new ApiException(HttpStatus.BAD_REQUEST, "validation_failed");
		}
		try {
			return users.saveAndFlush(new User(email, username, displayName, encoder.encode(password), admin));
		}
		catch (DataIntegrityViolationException e) {
			String text = rootText(e);
			if (text.contains("uq_app_user_email")) {
				throw new ApiException(HttpStatus.CONFLICT, "email_taken");
			}
			if (text.contains("uq_app_user_username")) {
				throw new ApiException(HttpStatus.CONFLICT, "username_taken");
			}
			throw e;
		}
	}

	private static String rootText(Throwable t) {
		StringBuilder sb = new StringBuilder();
		for (; t != null; t = t.getCause()) {
			sb.append(t.getMessage()).append('\n');
		}
		return sb.toString();
	}
}

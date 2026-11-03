package com.ricettine.account;

import com.ricettine.common.ApiException;
import java.util.Locale;
import java.util.Set;
import java.util.regex.Pattern;
import org.springframework.http.HttpStatus;

public final class Identity {

	private static final Pattern EMAIL = Pattern.compile("^[^@\\s]+@[^@\\s]+\\.[^@\\s]+$");
	private static final Pattern USERNAME = Pattern.compile("^[a-z0-9_]{3,30}$");
	private static final Set<String> RESERVED = Set.of("admin", "api", "media", "r", "c", "setup", "login",
			"logout", "register", "reset", "settings", "invite", "me", "new");

	private Identity() {
	}

	public static String normalizeEmail(String raw) {
		if (raw == null) {
			throw new ApiException(HttpStatus.BAD_REQUEST, "invalid_email");
		}
		String email = raw.trim().toLowerCase(Locale.ROOT);
		if (email.length() > 254 || !EMAIL.matcher(email).matches()) {
			throw new ApiException(HttpStatus.BAD_REQUEST, "invalid_email");
		}
		return email;
	}

	public static String validateUsername(String username) {
		if (username == null || !USERNAME.matcher(username).matches()) {
			throw new ApiException(HttpStatus.BAD_REQUEST, "invalid_username");
		}
		if (RESERVED.contains(username)) {
			throw new ApiException(HttpStatus.BAD_REQUEST, "username_reserved");
		}
		return username;
	}
}

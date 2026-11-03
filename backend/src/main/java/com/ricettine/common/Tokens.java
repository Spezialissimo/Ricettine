package com.ricettine.common;

import java.security.SecureRandom;
import java.util.Base64;

public final class Tokens {

	private static final SecureRandom RANDOM = new SecureRandom();

	private Tokens() {
	}

	/** 32 random bytes, base64url without padding (43 chars). */
	public static String newToken() {
		byte[] b = new byte[32];
		RANDOM.nextBytes(b);
		return Base64.getUrlEncoder().withoutPadding().encodeToString(b);
	}
}

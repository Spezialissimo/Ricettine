package com.ricettine.common;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.security.SecureRandom;
import java.util.Base64;
import java.util.HexFormat;

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

	/** SHA-256 of the token, lowercase hex (64 chars). Only this is ever stored. */
	public static String hash(String token) {
		try {
			return HexFormat.of().formatHex(
					MessageDigest.getInstance("SHA-256").digest(token.getBytes(StandardCharsets.UTF_8)));
		}
		catch (NoSuchAlgorithmException e) {
			throw new IllegalStateException(e);
		}
	}
}

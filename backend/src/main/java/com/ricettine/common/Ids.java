package com.ricettine.common;

import java.util.Optional;
import java.util.UUID;
import org.springframework.http.HttpStatus;

/** Parsing of ids that arrive as path segments. */
public final class Ids {

	private Ids() {
	}

	/** The id, or empty when it is not a UUID (it can't be anyone's row). */
	public static Optional<UUID> tryParse(String id) {
		try {
			return Optional.of(UUID.fromString(id));
		}
		catch (IllegalArgumentException e) {
			return Optional.empty();
		}
	}

	/** The id, or a 404 with {@code notFoundCode}: a malformed id gets the same answer as an unknown one. */
	public static UUID parse(String id, String notFoundCode) {
		return tryParse(id).orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, notFoundCode));
	}
}

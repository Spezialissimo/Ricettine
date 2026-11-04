package com.ricettine.feed;

import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.Base64;
import java.util.Optional;
import java.util.UUID;

/** Opaque keyset cursor: base64url (no padding) of {@code {publishedAt epoch micros}:{id}}. */
final class FeedCursor {

	record Key(Instant at, UUID id) {
	}

	private FeedCursor() {
	}

	static String encode(Instant at, UUID id) {
		long micros = ChronoUnit.MICROS.between(Instant.EPOCH, at);
		return Base64.getUrlEncoder().withoutPadding()
			.encodeToString((micros + ":" + id).getBytes(StandardCharsets.UTF_8));
	}

	static Optional<Key> decode(String cursor) {
		try {
			String s = new String(Base64.getUrlDecoder().decode(cursor), StandardCharsets.UTF_8);
			int i = s.indexOf(':');
			if (i < 1) {
				return Optional.empty();
			}
			long micros = Long.parseLong(s.substring(0, i));
			if (micros < 0) {
				return Optional.empty();
			}
			UUID id = UUID.fromString(s.substring(i + 1));
			Instant at = Instant.EPOCH.plus(micros, ChronoUnit.MICROS);
			// reject non-canonical forms so one key has one cursor
			return encode(at, id).equals(cursor) ? Optional.of(new Key(at, id)) : Optional.empty();
		}
		catch (IllegalArgumentException | java.time.DateTimeException | ArithmeticException e) {
			return Optional.empty();
		}
	}
}

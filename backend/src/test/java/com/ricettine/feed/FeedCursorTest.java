package com.ricettine.feed;

import static org.assertj.core.api.Assertions.assertThat;

import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.Base64;
import java.util.UUID;
import org.junit.jupiter.api.Test;

class FeedCursorTest {

	@Test
	void roundTrips() {
		Instant at = Instant.now().truncatedTo(ChronoUnit.MICROS);
		UUID id = UUID.randomUUID();
		var key = FeedCursor.decode(FeedCursor.encode(at, id));
		assertThat(key).isPresent();
		assertThat(key.get().at()).isEqualTo(at);
		assertThat(key.get().id()).isEqualTo(id);
	}

	@Test
	void malformedIsEmpty() {
		assertThat(FeedCursor.decode("x")).isEmpty();
		assertThat(FeedCursor.decode("")).isEmpty();
		assertThat(FeedCursor.decode(b64("1:not-a-uuid"))).isEmpty();
		assertThat(FeedCursor.decode(b64("-5:" + UUID.randomUUID()))).isEmpty();
		assertThat(FeedCursor.decode(b64("abc:" + UUID.randomUUID()))).isEmpty();
		assertThat(FeedCursor.decode(b64("99999999999999999999:" + UUID.randomUUID()))).isEmpty();
	}

	private static String b64(String s) {
		return Base64.getUrlEncoder().withoutPadding().encodeToString(s.getBytes(StandardCharsets.UTF_8));
	}
}

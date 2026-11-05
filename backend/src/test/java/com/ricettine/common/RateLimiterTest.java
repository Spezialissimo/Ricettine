package com.ricettine.common;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.Duration;
import java.util.ArrayList;
import java.util.List;
import org.junit.jupiter.api.Test;

class RateLimiterTest {

	private final MutableClock clock = new MutableClock();

	@Test
	void atLimitReportsTimeLeftInWindow() {
		RateLimiter l = new RateLimiter(3, Duration.ofMinutes(15), 100, clock);
		assertThat(l.check("k")).isEmpty();
		for (int i = 0; i < 3; i++) {
			l.hit("k");
		}
		clock.advance(Duration.ofMinutes(5));
		assertThat(l.check("k")).hasValueSatisfying(d -> assertThat(d).isBetween(Duration.ofMinutes(10).minusSeconds(1), Duration.ofMinutes(10)));
	}

	@Test
	void checkDoesNotCount() {
		RateLimiter l = new RateLimiter(1, Duration.ofMinutes(1), 100, clock);
		for (int i = 0; i < 5; i++) {
			assertThat(l.check("k")).isEmpty();
		}
		assertThat(l.count("k")).isZero();
	}

	@Test
	void windowExpires() {
		RateLimiter l = new RateLimiter(3, Duration.ofMinutes(15), 100, clock);
		for (int i = 0; i < 3; i++) {
			l.hit("k");
		}
		clock.advance(Duration.ofMinutes(15));
		assertThat(l.check("k")).isEmpty();
		l.hit("k");
		assertThat(l.count("k")).isEqualTo(1);
	}

	@Test
	void clearResets() {
		RateLimiter l = new RateLimiter(2, Duration.ofMinutes(15), 100, clock);
		l.hit("k");
		l.hit("k");
		assertThat(l.check("k")).isPresent();
		l.clear("k");
		assertThat(l.check("k")).isEmpty();
	}

	@Test
	void evictsLeastRecentlyUsedKey() {
		RateLimiter l = new RateLimiter(5, Duration.ofMinutes(15), 2, clock);
		l.hit("a");
		l.hit("b");
		l.hit("a"); // a is now most recent
		l.hit("c"); // evicts b
		assertThat(l.count("a")).isEqualTo(2);
		assertThat(l.count("b")).isZero();
		assertThat(l.count("c")).isEqualTo(1);
	}

	@Test
	void concurrentHitsAreAllCounted() throws Exception {
		RateLimiter l = new RateLimiter(1_000_000, Duration.ofHours(1), 10, clock);
		List<Thread> threads = new ArrayList<>();
		for (int t = 0; t < 8; t++) {
			Thread th = new Thread(() -> {
				for (int i = 0; i < 1000; i++) {
					l.hit("k");
				}
			});
			threads.add(th);
			th.start();
		}
		for (Thread th : threads) {
			th.join();
		}
		assertThat(l.count("k")).isEqualTo(8000);
	}
}

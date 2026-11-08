package com.ricettine.common;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.Duration;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import org.junit.jupiter.api.Test;

class RateLimiterTest {

	private final MutableClock clock = new MutableClock();

	@Test
	void atLimitReportsTimeLeftInWindow() {
		RateLimiter l = new RateLimiter(3, Duration.ofMinutes(15), 100, clock);
		for (int i = 0; i < 3; i++) {
			assertThat(l.tryHit("k")).isEmpty();
		}
		clock.advance(Duration.ofMinutes(5));
		assertThat(l.tryHit("k")).hasValueSatisfying(d -> assertThat(d).isBetween(Duration.ofMinutes(10).minusSeconds(1), Duration.ofMinutes(10)));
	}

	@Test
	void windowExpires() {
		RateLimiter l = new RateLimiter(3, Duration.ofMinutes(15), 100, clock);
		for (int i = 0; i < 3; i++) {
			l.tryHit("k");
		}
		clock.advance(Duration.ofMinutes(15));
		assertThat(l.tryHit("k")).isEmpty();
		assertThat(l.count("k")).isEqualTo(1);
	}

	@Test
	void clearResets() {
		RateLimiter l = new RateLimiter(2, Duration.ofMinutes(15), 100, clock);
		l.tryHit("k");
		l.tryHit("k");
		assertThat(l.tryHit("k")).isPresent();
		l.clear("k");
		assertThat(l.tryHit("k")).isEmpty();
	}

	@Test
	void evictsLeastRecentlyUsedKey() {
		RateLimiter l = new RateLimiter(5, Duration.ofMinutes(15), 2, clock);
		l.tryHit("a");
		l.tryHit("b");
		l.tryHit("a"); // a is now most recent
		l.tryHit("c"); // evicts b
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
					l.tryHit("k");
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

	@Test
	void tryHitIsAtomicUnderConcurrency() throws Exception {
		RateLimiter l = new RateLimiter(10, Duration.ofMinutes(15), 100, clock);
		var pool = Executors.newFixedThreadPool(32);
		var start = new CountDownLatch(1);
		List<Future<Boolean>> results = new ArrayList<>();
		for (int i = 0; i < 32; i++) {
			results.add(pool.submit(() -> {
				start.await();
				return l.tryHit("k").isEmpty();
			}));
		}
		start.countDown();
		int allowed = 0;
		for (var f : results) {
			if (f.get()) {
				allowed++;
			}
		}
		pool.shutdown();
		assertThat(allowed).isEqualTo(10);
		assertThat(l.count("k")).isEqualTo(10);
	}

	@Test
	void tryHitAtLimitReportsWaitAndDoesNotCount() {
		RateLimiter l = new RateLimiter(1, Duration.ofMinutes(15), 100, clock);
		assertThat(l.tryHit("k")).isEmpty();
		assertThat(l.tryHit("k")).isPresent();
		assertThat(l.count("k")).isEqualTo(1);
	}

	@Test
	void refundNeverGoesBelowZero() {
		RateLimiter l = new RateLimiter(3, Duration.ofMinutes(15), 100, clock);
		l.refund("missing");
		assertThat(l.count("missing")).isZero();
		l.tryHit("k");
		l.refund("k");
		l.refund("k");
		assertThat(l.count("k")).isZero();
		assertThat(l.tryHit("k")).isEmpty();
		assertThat(l.count("k")).isEqualTo(1);
	}
}

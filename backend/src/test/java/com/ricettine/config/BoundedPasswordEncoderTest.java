package com.ricettine.config;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.ricettine.common.ApiException;
import java.time.Duration;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;
import org.springframework.security.crypto.password.PasswordEncoder;

class BoundedPasswordEncoderTest {

	/** Delegate that tracks how many hashes run at once and can be held open by a latch. */
	static final class Probe implements PasswordEncoder {
		final AtomicInteger running = new AtomicInteger();
		final AtomicInteger maxRunning = new AtomicInteger();
		final CountDownLatch release;
		final CountDownLatch entered;

		Probe(CountDownLatch release, int expectedEntries) {
			this.release = release;
			this.entered = new CountDownLatch(expectedEntries);
		}

		private <T> T work(T result) {
			int now = running.incrementAndGet();
			maxRunning.accumulateAndGet(now, Math::max);
			entered.countDown();
			try {
				release.await(5, TimeUnit.SECONDS);
			}
			catch (InterruptedException e) {
				Thread.currentThread().interrupt();
			}
			finally {
				running.decrementAndGet();
			}
			return result;
		}

		@Override
		public String encode(CharSequence raw) {
			return work("{x}" + raw);
		}

		@Override
		public boolean matches(CharSequence raw, String encoded) {
			return work(encoded.equals("{x}" + raw));
		}
	}

	@Test
	void neverRunsMoreThanThePermitCount() throws Exception {
		CountDownLatch release = new CountDownLatch(1);
		Probe probe = new Probe(release, 2);
		PasswordEncoder bounded = new BoundedPasswordEncoder(probe, 2, Duration.ofSeconds(5));
		ExecutorService pool = Executors.newFixedThreadPool(8);
		try {
			List<Future<?>> futures = new ArrayList<>();
			for (int i = 0; i < 8; i++) {
				int n = i;
				futures.add(pool.submit(() -> n % 2 == 0 ? bounded.encode("pw") : bounded.matches("pw", "{x}pw")));
			}
			assertThat(probe.entered.await(5, TimeUnit.SECONDS)).isTrue();
			Thread.sleep(200); // give the other six a chance to (wrongly) get in
			assertThat(probe.running.get()).isEqualTo(2);
			release.countDown();
			for (Future<?> f : futures) {
				f.get(10, TimeUnit.SECONDS);
			}
			assertThat(probe.maxRunning.get()).isEqualTo(2);
		}
		finally {
			pool.shutdownNow();
		}
	}

	@Test
	void timesOutWith503Busy() throws Exception {
		CountDownLatch release = new CountDownLatch(1);
		Probe probe = new Probe(release, 1);
		PasswordEncoder bounded = new BoundedPasswordEncoder(probe, 1, Duration.ofMillis(100));
		ExecutorService pool = Executors.newSingleThreadExecutor();
		try {
			Future<String> holder = pool.submit(() -> bounded.encode("pw"));
			assertThat(probe.entered.await(5, TimeUnit.SECONDS)).isTrue();
			assertThatThrownBy(() -> bounded.matches("pw", "{x}pw")).isInstanceOfSatisfying(ApiException.class, e -> {
				assertThat(e.getStatus()).isEqualTo(HttpStatus.SERVICE_UNAVAILABLE);
				assertThat(e.getCode()).isEqualTo("busy");
			});
			release.countDown();
			assertThat(holder.get(5, TimeUnit.SECONDS)).isEqualTo("{x}pw");
			// the permit came back
			assertThat(bounded.matches("pw", "{x}pw")).isTrue();
		}
		finally {
			pool.shutdownNow();
		}
	}

	@Test
	void permitIsReleasedWhenTheDelegateThrows() {
		PasswordEncoder failing = new PasswordEncoder() {
			@Override
			public String encode(CharSequence raw) {
				throw new IllegalStateException("boom");
			}

			@Override
			public boolean matches(CharSequence raw, String encoded) {
				throw new IllegalStateException("boom");
			}
		};
		PasswordEncoder bounded = new BoundedPasswordEncoder(failing, 1, Duration.ofMillis(50));
		for (int i = 0; i < 3; i++) {
			assertThatThrownBy(() -> bounded.encode("pw")).isInstanceOf(IllegalStateException.class);
		}
	}

	@Test
	void upgradeEncodingDelegates() {
		PasswordEncoder delegate = new PasswordEncoder() {
			@Override
			public String encode(CharSequence raw) {
				return raw.toString();
			}

			@Override
			public boolean matches(CharSequence raw, String encoded) {
				return true;
			}

			@Override
			public boolean upgradeEncoding(String encoded) {
				return encoded.startsWith("{bcrypt}");
			}
		};
		PasswordEncoder bounded = new BoundedPasswordEncoder(delegate, 1, Duration.ofMillis(50));
		assertThat(bounded.upgradeEncoding("{bcrypt}abc")).isTrue();
		assertThat(bounded.upgradeEncoding("{argon2}abc")).isFalse();
	}
}

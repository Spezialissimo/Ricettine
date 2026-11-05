package com.ricettine.config;

import com.ricettine.common.ApiException;
import java.time.Duration;
import java.util.concurrent.Semaphore;
import java.util.concurrent.TimeUnit;
import java.util.function.Supplier;
import org.springframework.http.HttpStatus;
import org.springframework.security.crypto.password.PasswordEncoder;

/**
 * Caps how many password hashes run at once. Argon2 allocates ~16 MB per hash and login is unauthenticated, so
 * without a bound a burst of requests could exhaust a small host's heap. A caller that cannot get a permit within
 * {@code wait} gets 503 {@code busy}.
 */
public final class BoundedPasswordEncoder implements PasswordEncoder {

	private final PasswordEncoder delegate;
	private final Semaphore permits;
	private final Duration wait;

	public BoundedPasswordEncoder(PasswordEncoder delegate, int maxConcurrent, Duration wait) {
		if (maxConcurrent < 1) {
			throw new IllegalArgumentException("maxConcurrent must be >= 1");
		}
		this.delegate = delegate;
		this.permits = new Semaphore(maxConcurrent, true);
		this.wait = wait;
	}

	@Override
	public String encode(CharSequence rawPassword) {
		return bounded(() -> delegate.encode(rawPassword));
	}

	@Override
	public boolean matches(CharSequence rawPassword, String encodedPassword) {
		return bounded(() -> delegate.matches(rawPassword, encodedPassword));
	}

	/** Only inspects the stored hash's prefix/parameters: cheap, not bounded. */
	@Override
	public boolean upgradeEncoding(String encodedPassword) {
		return delegate.upgradeEncoding(encodedPassword);
	}

	private <T> T bounded(Supplier<T> hash) {
		try {
			if (!permits.tryAcquire(wait.toNanos(), TimeUnit.NANOSECONDS)) {
				throw busy();
			}
		}
		catch (InterruptedException e) {
			Thread.currentThread().interrupt();
			throw busy();
		}
		try {
			return hash.get();
		}
		finally {
			permits.release();
		}
	}

	private static ApiException busy() {
		return new ApiException(HttpStatus.SERVICE_UNAVAILABLE, "busy").retryAfter(Duration.ofSeconds(10));
	}
}

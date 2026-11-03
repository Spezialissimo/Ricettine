package com.ricettine.media;

import com.ricettine.common.ApiException;
import java.time.Duration;
import java.util.concurrent.Semaphore;
import java.util.concurrent.TimeUnit;
import java.util.function.Supplier;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;

/**
 * Caps how many images are decoded/resized at once so simultaneous uploads cannot exhaust a small heap. A caller
 * that cannot get a permit within {@code wait} gets 503 {@code busy}.
 */
@Component
public class ProcessingLimiter {

	private final Semaphore permits;
	private final Duration wait;

	public ProcessingLimiter(@Value("${ricettine.media.max-concurrent-processing:2}") int maxConcurrent,
			@Value("${ricettine.media.processing-wait:30s}") Duration wait) {
		if (maxConcurrent < 1) {
			throw new IllegalArgumentException("maxConcurrent must be >= 1");
		}
		this.permits = new Semaphore(maxConcurrent, true);
		this.wait = wait;
	}

	public <T> T run(Supplier<T> task) {
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
			return task.get();
		}
		finally {
			permits.release();
		}
	}

	private static ApiException busy() {
		return new ApiException(HttpStatus.SERVICE_UNAVAILABLE, "busy");
	}
}

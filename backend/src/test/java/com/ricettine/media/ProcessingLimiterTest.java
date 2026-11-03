package com.ricettine.media;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.ricettine.common.ApiException;
import java.time.Duration;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;
import org.junit.jupiter.api.Test;

class ProcessingLimiterTest {

	@Test
	void boundsConcurrentProcessing() throws Exception {
		ProcessingLimiter limiter = new ProcessingLimiter(2, Duration.ofSeconds(30));
		CountDownLatch release = new CountDownLatch(1);
		AtomicInteger running = new AtomicInteger();
		AtomicInteger peak = new AtomicInteger();
		ExecutorService pool = Executors.newFixedThreadPool(3);
		try {
			Future<?>[] fs = new Future<?>[3];
			for (int i = 0; i < 3; i++) {
				fs[i] = pool.submit(() -> limiter.run(() -> {
					peak.accumulateAndGet(running.incrementAndGet(), Math::max);
					try {
						release.await();
					}
					catch (InterruptedException e) {
						Thread.currentThread().interrupt();
					}
					running.decrementAndGet();
					return null;
				}));
			}
			long deadline = System.nanoTime() + TimeUnit.SECONDS.toNanos(5);
			while (running.get() < 2 && System.nanoTime() < deadline) {
				Thread.sleep(10);
			}
			Thread.sleep(300); // give the third a chance to (wrongly) start
			assertThat(running.get()).isEqualTo(2);
			release.countDown();
			for (Future<?> f : fs) {
				f.get(5, TimeUnit.SECONDS);
			}
			assertThat(peak.get()).isEqualTo(2);
		}
		finally {
			release.countDown();
			pool.shutdownNow();
		}
	}

	@Test
	void waitingTooLongIsBusy() throws Exception {
		ProcessingLimiter limiter = new ProcessingLimiter(1, Duration.ofMillis(100));
		CountDownLatch holding = new CountDownLatch(1);
		CountDownLatch release = new CountDownLatch(1);
		ExecutorService pool = Executors.newSingleThreadExecutor();
		try {
			pool.submit(() -> limiter.run(() -> {
				holding.countDown();
				try {
					release.await();
				}
				catch (InterruptedException e) {
					Thread.currentThread().interrupt();
				}
				return null;
			}));
			assertThat(holding.await(5, TimeUnit.SECONDS)).isTrue();
			assertThatThrownBy(() -> limiter.run(() -> "x")).isInstanceOfSatisfying(ApiException.class, e -> {
				assertThat(e.getCode()).isEqualTo("busy");
				assertThat(e.getStatus().value()).isEqualTo(503);
			});
		}
		finally {
			release.countDown();
			pool.shutdownNow();
		}
	}

	@Test
	void throwingTaskReleasesItsPermit() {
		ProcessingLimiter limiter = new ProcessingLimiter(1, Duration.ofMillis(100));
		assertThatThrownBy(() -> limiter.run(() -> {
			throw new IllegalStateException("boom");
		})).isInstanceOf(IllegalStateException.class);
		assertThat(limiter.run(() -> "ok")).isEqualTo("ok");
	}
}

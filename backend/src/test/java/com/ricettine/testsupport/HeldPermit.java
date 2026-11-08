package com.ricettine.testsupport;

import com.ricettine.media.ProcessingLimiter;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;

/** Holds one processing permit on a background thread until closed, so the next caller sees a busy limiter. */
public final class HeldPermit implements AutoCloseable {

	private final CountDownLatch release = new CountDownLatch(1);
	private final CompletableFuture<Void> holder;

	private HeldPermit(ProcessingLimiter limiter) throws InterruptedException {
		CountDownLatch held = new CountDownLatch(1);
		holder = CompletableFuture.runAsync(() -> limiter.run(() -> {
			held.countDown();
			try {
				release.await(30, TimeUnit.SECONDS);
			}
			catch (InterruptedException e) {
				Thread.currentThread().interrupt();
			}
			return null;
		}));
		if (!held.await(10, TimeUnit.SECONDS)) {
			close();
			throw new IllegalStateException("the permit was not acquired in time");
		}
	}

	public static HeldPermit acquire(ProcessingLimiter limiter) throws InterruptedException {
		return new HeldPermit(limiter);
	}

	@Override
	public void close() {
		release.countDown();
		holder.orTimeout(10, TimeUnit.SECONDS).join();
	}
}

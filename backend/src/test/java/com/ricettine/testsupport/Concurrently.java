package com.ricettine.testsupport;

import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.Callable;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutionException;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.function.IntFunction;

/** Test helper: runs tasks on their own threads, released together by a start latch, and always shuts the pool down. */
public final class Concurrently {

	private Concurrently() {
	}

	/** Runs {@code task} on {@code threads} threads at once and returns the results in thread order. */
	public static <T> List<T> run(int threads, Callable<T> task) throws Exception {
		return run(threads, i -> task);
	}

	/** Like {@link #run(int, Callable)}, with a task of its own per thread index. */
	public static <T> List<T> run(int threads, IntFunction<Callable<T>> tasks) throws Exception {
		ExecutorService pool = Executors.newFixedThreadPool(threads);
		try {
			CountDownLatch go = new CountDownLatch(1);
			List<Future<T>> futures = new ArrayList<>();
			for (int i = 0; i < threads; i++) {
				Callable<T> task = tasks.apply(i);
				futures.add(pool.submit(() -> {
					go.await();
					return task.call();
				}));
			}
			go.countDown();
			List<T> results = new ArrayList<>();
			for (Future<T> f : futures) {
				try {
					results.add(f.get());
				}
				catch (ExecutionException e) {
					throw e.getCause() instanceof Exception cause ? cause : e;
				}
			}
			return results;
		}
		finally {
			pool.shutdownNow();
		}
	}
}

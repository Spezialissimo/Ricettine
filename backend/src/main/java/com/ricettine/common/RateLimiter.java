package com.ricettine.common;

import java.time.Clock;
import java.time.Duration;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Optional;

/**
 * In-memory fixed-window counter per key. Keys live in an access-ordered LRU capped at {@code maxKeys}, so key churn
 * (e.g. random emails or IPs) cannot exhaust memory. {@link #check} does not count; {@link #hit} does.
 */
public final class RateLimiter {

	private static final class Window {
		long startMillis;
		int count;

		Window(long startMillis) {
			this.startMillis = startMillis;
		}
	}

	private final int limit;
	private final long windowMillis;
	private final Clock clock;
	private final Map<String, Window> windows;

	public RateLimiter(int limit, Duration window, int maxKeys, Clock clock) {
		if (limit < 1 || maxKeys < 1 || window.isZero() || window.isNegative()) {
			throw new IllegalArgumentException("limit, maxKeys and window must be positive");
		}
		this.limit = limit;
		this.windowMillis = window.toMillis();
		this.clock = clock;
		this.windows = new LinkedHashMap<>(16, 0.75f, true) {
			@Override
			protected boolean removeEldestEntry(Map.Entry<String, Window> eldest) {
				return size() > maxKeys;
			}
		};
	}

	/** Time until the window resets when {@code key} is at its limit, else empty. Does not count. */
	public Optional<Duration> check(String key) {
		synchronized (windows) {
			long now = clock.millis();
			Window w = windows.get(key);
			if (w == null || expired(w, now) || w.count < limit) {
				return Optional.empty();
			}
			return Optional.of(Duration.ofMillis(w.startMillis + windowMillis - now));
		}
	}

	/** Atomically counts a hit unless {@code key} is at its limit; then returns the wait and does not count. */
	public Optional<Duration> tryHit(String key) {
		synchronized (windows) {
			long now = clock.millis();
			Window w = windows.get(key);
			if (w == null || expired(w, now)) {
				w = new Window(now);
				windows.put(key, w);
			}
			if (w.count >= limit) {
				return Optional.of(Duration.ofMillis(w.startMillis + windowMillis - now));
			}
			w.count++;
			return Optional.empty();
		}
	}

	/** Gives back one hit in the current window; never goes below zero. */
	public void refund(String key) {
		synchronized (windows) {
			Window w = windows.get(key);
			if (w != null && !expired(w, clock.millis()) && w.count > 0) {
				w.count--;
			}
		}
	}

	public void hit(String key) {
		synchronized (windows) {
			long now = clock.millis();
			Window w = windows.get(key);
			if (w == null || expired(w, now)) {
				w = new Window(now);
				windows.put(key, w);
			}
			w.count++;
		}
	}

	public void clear(String key) {
		synchronized (windows) {
			windows.remove(key);
		}
	}

	int count(String key) {
		synchronized (windows) {
			Window w = windows.get(key);
			return w == null || expired(w, clock.millis()) ? 0 : w.count;
		}
	}

	private boolean expired(Window w, long now) {
		return now - w.startMillis >= windowMillis;
	}
}

package com.ricettine.site;

import java.util.function.Supplier;

/** Thread-bound current {@link Site}; {@link Site#MAIN} when unset. */
public final class SiteContext {

	private static final ThreadLocal<Site> CURRENT = new ThreadLocal<>();

	private SiteContext() {
	}

	public static Site current() {
		Site site = CURRENT.get();
		return site == null ? Site.MAIN : site;
	}

	public static <T> T callAs(Site site, Supplier<T> action) {
		Site previous = CURRENT.get();
		CURRENT.set(site);
		try {
			return action.get();
		}
		finally {
			restore(previous);
		}
	}

	public static void runAs(Site site, Runnable action) {
		callAs(site, () -> {
			action.run();
			return null;
		});
	}

	static void set(Site site) {
		CURRENT.set(site);
	}

	static void clear() {
		CURRENT.remove();
	}

	private static void restore(Site previous) {
		if (previous == null) {
			CURRENT.remove();
		}
		else {
			CURRENT.set(previous);
		}
	}
}

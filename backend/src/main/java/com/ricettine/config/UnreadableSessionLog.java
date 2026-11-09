package com.ricettine.config;

import java.util.Arrays;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Set;

/**
 * Remembers which unreadable session payloads were already reported, so a stale session logs its WARN once instead
 * of on every request. The converter never sees the session id, but a session's stored payload is stable until the
 * user logs in again, so the payload identifies it. Bounded (oldest forgotten first) so it cannot grow.
 */
final class UnreadableSessionLog {

	private final Set<Integer> seen;

	UnreadableSessionLog(int capacity) {
		this.seen = Collections.newSetFromMap(Collections.synchronizedMap(new LinkedHashMap<>() {
			@Override
			protected boolean removeEldestEntry(Map.Entry<Integer, Boolean> eldest) {
				return size() > capacity;
			}
		}));
	}

	/** True the first time this payload is seen (until it is evicted). */
	boolean firstSighting(byte[] payload) {
		return seen.add(Arrays.hashCode(payload));
	}
}

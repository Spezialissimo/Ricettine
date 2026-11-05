package com.ricettine.common;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneId;
import java.time.ZoneOffset;

/** Test clock: follows the system clock plus an adjustable offset. */
public final class MutableClock extends Clock {

	private volatile Duration offset = Duration.ZERO;

	public void advance(Duration d) {
		offset = offset.plus(d);
	}

	public void reset() {
		offset = Duration.ZERO;
	}

	@Override
	public ZoneId getZone() {
		return ZoneOffset.UTC;
	}

	@Override
	public Clock withZone(ZoneId zone) {
		return this;
	}

	@Override
	public Instant instant() {
		return Instant.now().plus(offset);
	}
}

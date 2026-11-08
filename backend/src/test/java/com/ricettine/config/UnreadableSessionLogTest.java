package com.ricettine.config;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;

class UnreadableSessionLogTest {

	@Test
	void reportsAPayloadOnceAndRepeatsAtDebugLevel() {
		UnreadableSessionLog seen = new UnreadableSessionLog(10);
		byte[] a = {1, 2, 3};
		assertThat(seen.firstSighting(a)).isTrue();
		assertThat(seen.firstSighting(new byte[] {1, 2, 3})).isFalse();
		assertThat(seen.firstSighting(a)).isFalse();
		assertThat(seen.firstSighting(new byte[] {4})).isTrue();
	}

	@Test
	void remembersAtMostCapacityPayloads() {
		UnreadableSessionLog seen = new UnreadableSessionLog(2);
		assertThat(seen.firstSighting(new byte[] {1})).isTrue();
		assertThat(seen.firstSighting(new byte[] {2})).isTrue();
		assertThat(seen.firstSighting(new byte[] {3})).isTrue();
		// {1} was evicted to make room, so it is news again; {3} is still remembered.
		assertThat(seen.firstSighting(new byte[] {3})).isFalse();
		assertThat(seen.firstSighting(new byte[] {1})).isTrue();
	}
}

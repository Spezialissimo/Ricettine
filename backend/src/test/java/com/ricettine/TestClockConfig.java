package com.ricettine;

import com.ricettine.common.MutableClock;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Primary;

/** Replaces the app Clock for every integration test; tests that advance it must {@code reset()} afterwards. */
@TestConfiguration(proxyBeanMethods = false)
public class TestClockConfig {

	@Bean
	@Primary
	MutableClock testClock() {
		return new MutableClock();
	}
}

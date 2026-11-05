package com.ricettine.common;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.ricettine.config.LimitsConfig;
import java.time.Clock;
import org.junit.jupiter.api.Test;

class RateLimitsTest {

	@Test
	void keysLongerThan320CharactersShareACounterOnTheirFirst320() {
		LimitsConfig cfg = new LimitsConfig();
		cfg.getLoginAccount().setLimit(2);
		RateLimits limits = new RateLimits(cfg, Clock.systemUTC());
		String prefix = "a".repeat(320);
		limits.loginFailed("1.1.1.1", prefix + "x");
		limits.loginFailed("1.1.1.2", prefix + "y");
		assertThatThrownBy(() -> limits.checkLogin("1.1.1.3", prefix + "z")).isInstanceOf(ApiException.class);
		assertThat(prefix.length()).isEqualTo(320);
	}
}

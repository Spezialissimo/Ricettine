package com.ricettine.common;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.ricettine.config.LimitsConfig;
import java.time.Clock;
import org.junit.jupiter.api.Test;

class RateLimitsTest {

	private static RateLimits limits(int accountLimit, int ipLimit) {
		LimitsConfig cfg = new LimitsConfig();
		cfg.getLoginAccount().setLimit(accountLimit);
		cfg.getLoginIp().setLimit(ipLimit);
		return new RateLimits(cfg, Clock.systemUTC());
	}

	@Test
	void keysLongerThan320CharactersShareACounterOnTheirFirst320() {
		RateLimits limits = limits(2, 100);
		String prefix = "a".repeat(320);
		limits.reserveLogin("1.1.1.1", prefix + "x").failed();
		limits.reserveLogin("1.1.1.2", prefix + "y").failed();
		assertThatThrownBy(() -> limits.reserveLogin("1.1.1.3", prefix + "z")).isInstanceOf(ApiException.class);
	}

	@Test
	void reservationCountsUntilRefunded() {
		RateLimits limits = limits(1, 100);
		var a = limits.reserveLogin("1.1.1.1", "e@x.com");
		assertThatThrownBy(() -> limits.reserveLogin("1.1.1.2", "e@x.com")).isInstanceOf(ApiException.class);
		a.abandoned();
		limits.reserveLogin("1.1.1.2", "e@x.com").succeeded();
		limits.reserveLogin("1.1.1.2", "e@x.com").failed();
		assertThatThrownBy(() -> limits.reserveLogin("1.1.1.2", "e@x.com")).isInstanceOf(ApiException.class);
	}

	@Test
	void rejectionByOneLimiterRefundsTheOther() {
		RateLimits limits = limits(1, 100);
		limits.reserveLogin("1.1.1.1", "a@x.com").failed();
		// a@x.com is at its limit: the IP reservation taken first must be given back
		for (int i = 0; i < 150; i++) {
			assertThatThrownBy(() -> limits.reserveLogin("2.2.2.2", "a@x.com")).isInstanceOf(ApiException.class);
		}
		limits.reserveLogin("2.2.2.2", "b@x.com").failed();
	}

	@Test
	void successClearsAccountAndRefundsIp() {
		RateLimits limits = limits(1, 1);
		limits.reserveLogin("1.1.1.1", "a@x.com").succeeded();
		limits.reserveLogin("1.1.1.1", "a@x.com").succeeded();
	}

	@Test
	void ipv6AddressesShareTheirSlash64() {
		assertThat(RateLimits.ipKey("2001:db8:1:2:aaaa:bbbb:cccc:dddd"))
			.isEqualTo(RateLimits.ipKey("2001:db8:1:2:1::1"));
		assertThat(RateLimits.ipKey("2001:db8:1:2::1")).isNotEqualTo(RateLimits.ipKey("2001:db8:1:3::1"));
		assertThat(RateLimits.ipKey("10.1.2.3")).isEqualTo("10.1.2.3");
		assertThat(RateLimits.ipKey("not an ip")).isEqualTo("not an ip");
	}
}

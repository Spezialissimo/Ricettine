package com.ricettine.account;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.ricettine.common.ApiException;
import org.junit.jupiter.api.Test;

class IdentityTest {

	@Test
	void normalizesEmail() {
		assertThat(Identity.normalizeEmail(" Davide@X.com ")).isEqualTo("davide@x.com");
	}

	@Test
	void rejectsBadEmail() {
		assertCode(() -> Identity.normalizeEmail("not-an-email"), "invalid_email");
		assertCode(() -> Identity.normalizeEmail(null), "invalid_email");
		assertCode(() -> Identity.normalizeEmail("a".repeat(250) + "@x.com"), "invalid_email");
	}

	@Test
	void rejectsUppercaseUsername() {
		assertCode(() -> Identity.validateUsername("Davide_1"), "invalid_username");
	}

	@Test
	void rejectsTooShortUsername() {
		assertCode(() -> Identity.validateUsername("ab"), "invalid_username");
	}

	@Test
	void rejectsReservedUsername() {
		assertCode(() -> Identity.validateUsername("api"), "username_reserved");
	}

	@Test
	void acceptsValidUsername() {
		assertThat(Identity.validateUsername("davide_1")).isEqualTo("davide_1");
	}

	private static void assertCode(Runnable r, String code) {
		assertThatThrownBy(r::run)
			.isInstanceOfSatisfying(ApiException.class, e -> assertThat(e.getCode()).isEqualTo(code));
	}
}

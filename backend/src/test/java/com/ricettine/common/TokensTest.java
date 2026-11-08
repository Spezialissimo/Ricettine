package com.ricettine.common;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;

class TokensTest {

	@Test
	void tokenIs43UrlSafeChars() {
		assertThat(Tokens.newToken()).hasSize(43).matches("[A-Za-z0-9_-]{43}");
	}

	@Test
	void tokensDiffer() {
		assertThat(Tokens.newToken()).isNotEqualTo(Tokens.newToken());
	}

	@Test
	void hashIs64LowercaseHexAndDeterministic() {
		assertThat(Tokens.hash("abc")).hasSize(64).matches("[0-9a-f]{64}").isEqualTo(Tokens.hash("abc"));
		assertThat(Tokens.hash("abc")).isEqualTo("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
		assertThat(Tokens.hash("abc")).isNotEqualTo(Tokens.hash("abd"));
	}

	@Test
	void matchesComparesStoredAndSuppliedTokens() {
		assertThat(Tokens.matches("abc", "abc")).isTrue();
		assertThat(Tokens.matches("abc", "abd")).isFalse();
		assertThat(Tokens.matches("abc", "abcd")).isFalse();
		assertThat(Tokens.matches("abc", "")).isFalse();
		assertThat(Tokens.matches(null, "abc")).isFalse();
		assertThat(Tokens.matches("abc", null)).isFalse();
		assertThat(Tokens.matches(null, null)).isFalse();
	}
}

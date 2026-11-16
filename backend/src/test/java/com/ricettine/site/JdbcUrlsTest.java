package com.ricettine.site;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import org.junit.jupiter.api.Test;

class JdbcUrlsTest {

	@Test
	void replacesTheDatabaseName() {
		assertThat(JdbcUrls.withDatabase("jdbc:postgresql://db:5432/ricettine", "ricettine_demo"))
			.isEqualTo("jdbc:postgresql://db:5432/ricettine_demo");
	}

	@Test
	void keepsTheQueryString() {
		assertThat(JdbcUrls.withDatabase("jdbc:postgresql://db:5432/ricettine?x=1&y=2", "ricettine_demo"))
			.isEqualTo("jdbc:postgresql://db:5432/ricettine_demo?x=1&y=2");
	}

	@Test
	void toleratesATrailingSlash() {
		assertThat(JdbcUrls.withDatabase("jdbc:postgresql://db:5432/ricettine/", "ricettine_demo"))
			.isEqualTo("jdbc:postgresql://db:5432/ricettine_demo");
	}

	@Test
	void rejectsAUrlWithoutDatabase() {
		assertThatThrownBy(() -> JdbcUrls.withDatabase("jdbc:postgresql://db:5432", "d"))
			.isInstanceOf(IllegalArgumentException.class);
		assertThatThrownBy(() -> JdbcUrls.withDatabase("jdbc:postgresql://db:5432/", "d"))
			.isInstanceOf(IllegalArgumentException.class);
	}
}

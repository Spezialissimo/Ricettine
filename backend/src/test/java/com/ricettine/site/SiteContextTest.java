package com.ricettine.site;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import org.junit.jupiter.api.Test;

class SiteContextTest {

	@Test
	void defaultsToMain() {
		assertThat(SiteContext.current()).isEqualTo(Site.MAIN);
	}

	@Test
	void blobPrefixes() {
		assertThat(Site.MAIN.blobPrefix()).isEmpty();
		assertThat(Site.DEMO.blobPrefix()).isEqualTo("demo/");
	}

	@Test
	void callAsRestoresPrevious() {
		String result = SiteContext.callAs(Site.DEMO, () -> {
			assertThat(SiteContext.current()).isEqualTo(Site.DEMO);
			SiteContext.runAs(Site.MAIN, () -> assertThat(SiteContext.current()).isEqualTo(Site.MAIN));
			assertThat(SiteContext.current()).isEqualTo(Site.DEMO);
			return "ok";
		});
		assertThat(result).isEqualTo("ok");
		assertThat(SiteContext.current()).isEqualTo(Site.MAIN);
	}

	@Test
	void callAsRestoresPreviousOnException() {
		assertThatThrownBy(() -> SiteContext.runAs(Site.DEMO, () -> {
			throw new IllegalStateException("boom");
		})).isInstanceOf(IllegalStateException.class);
		assertThat(SiteContext.current()).isEqualTo(Site.MAIN);
	}
}

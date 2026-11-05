package com.ricettine.config;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.Duration;
import java.util.Map;
import org.junit.jupiter.api.Test;
import org.springframework.boot.context.properties.bind.Binder;
import org.springframework.boot.context.properties.source.ConfigurationPropertySources;
import org.springframework.core.env.MapPropertySource;
import org.springframework.core.env.MutablePropertySources;
import org.springframework.core.env.SystemEnvironmentPropertySource;

class LimitsConfigTest {

	@Test
	void bindsFromEnvironmentVariableNames() {
		MutablePropertySources sources = new MutablePropertySources();
		sources.addFirst(new SystemEnvironmentPropertySource("systemEnvironment", Map.of("RICETTINE_LIMITS_LOGINIP_LIMIT", "100000",
				"RICETTINE_LIMITS_ANONYMOUSAUTH_LIMIT", "7", "RICETTINE_LIMITS_UPLOADS_WINDOW", "PT5M")));
		LimitsConfig cfg = new Binder(ConfigurationPropertySources.from(sources))
			.bind("ricettine.limits", LimitsConfig.class).get();
		assertThat(cfg.getLoginIp().getLimit()).isEqualTo(100000);
		assertThat(cfg.getAnonymousAuth().getLimit()).isEqualTo(7);
		assertThat(cfg.getUploads().getWindow()).isEqualTo(Duration.ofMinutes(5));
		assertThat(cfg.getLoginAccount().getLimit()).isEqualTo(10);
	}

	@Test
	void bindsKebabCaseYamlNames() {
		MutablePropertySources sources = new MutablePropertySources();
		sources.addFirst(new MapPropertySource("p", Map.of("ricettine.limits.login-ip.limit", "5")));
		LimitsConfig cfg = new Binder(ConfigurationPropertySources.from(sources))
			.bind("ricettine.limits", LimitsConfig.class).get();
		assertThat(cfg.getLoginIp().getLimit()).isEqualTo(5);
	}
}

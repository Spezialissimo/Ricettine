package com.ricettine.site;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.Map;
import org.junit.jupiter.api.Test;
import org.springframework.boot.context.properties.bind.Binder;
import org.springframework.boot.context.properties.source.MapConfigurationPropertySource;

class DemoPropertiesBindingTest {

	@Test
	void readOnlyDefaultsToTrueWhenUnset() {
		Binder binder = new Binder(new MapConfigurationPropertySource(Map.of("ricettine.demo.enabled", "true")));
		DemoProperties props = binder.bind("ricettine.demo", DemoProperties.class).get();
		assertThat(props.enabled()).isTrue();
		assertThat(props.readOnly()).isTrue();
	}

	@Test
	void readOnlyCanBeTurnedOff() {
		Binder binder = new Binder(new MapConfigurationPropertySource(Map.of("ricettine.demo.read-only", "false")));
		assertThat(binder.bind("ricettine.demo", DemoProperties.class).get().readOnly()).isFalse();
	}
}

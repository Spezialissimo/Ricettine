package com.ricettine.site;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;
import org.springframework.web.context.request.RequestContextHolder;
import org.springframework.web.context.request.ServletRequestAttributes;
import org.springframework.web.servlet.support.ServletUriComponentsBuilder;

class SeedRequestTest {

	@Test
	void linkBuildersWorkWithTheStandInRequest() {
		RequestContextHolder.setRequestAttributes(new ServletRequestAttributes(SeedRequest.create()));
		try {
			assertThat(ServletUriComponentsBuilder.fromCurrentContextPath().build().toUriString())
				.isEqualTo("http://localhost");
		}
		finally {
			RequestContextHolder.resetRequestAttributes();
		}
	}
}

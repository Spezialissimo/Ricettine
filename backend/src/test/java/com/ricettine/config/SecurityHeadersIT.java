package com.ricettine.config;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;

import com.ricettine.IntegrationTest;
import org.junit.jupiter.api.Test;

class SecurityHeadersIT extends IntegrationTest {

	@Test
	void spaAndApiCarryCspAndReferrerPolicy() throws Exception {
		for (String path : new String[] {"/", "/api/me", "/r/x"}) {
			var res = mvc.perform(get(path)).andReturn().getResponse();
			assertThat(res.getHeader("Content-Security-Policy")).as(path).contains("default-src 'self'")
					.contains("object-src 'none'").contains("frame-ancestors 'none'");
			assertThat(res.getHeader("Referrer-Policy")).as(path).isEqualTo("same-origin");
		}
	}
}

package com.ricettine.site;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;

import com.ricettine.DemoIntegrationTest;
import org.junit.jupiter.api.Test;

class SiteStatusIT extends DemoIntegrationTest {

	@Test
	void mainAdvertisesTheDemo() throws Exception {
		mvc.perform(get("/api/setup/status")).andExpect(jsonPath("$.setupRequired").value(true))
			.andExpect(jsonPath("$.demo").value(false)).andExpect(jsonPath("$.demoUrl").value("http://demo.test"));
	}

	@Test
	void demoSiteFlagsItselfWithoutUrl() throws Exception {
		mvc.perform(demo(get("/api/setup/status"))).andExpect(jsonPath("$.setupRequired").value(false))
			.andExpect(jsonPath("$.demo").value(true))
			.andExpect(jsonPath("$.demoUrl").value(org.hamcrest.Matchers.nullValue()));
	}
}

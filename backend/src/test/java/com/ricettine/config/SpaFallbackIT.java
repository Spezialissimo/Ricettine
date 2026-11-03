package com.ricettine.config;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.ricettine.IntegrationTest;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.security.test.context.support.WithMockUser;

class SpaFallbackIT extends IntegrationTest {

	@Test
	void rootServesIndex() throws Exception {
		mvc.perform(get("/"))
				.andExpect(status().isOk())
				.andExpect(content().string(org.hamcrest.Matchers.containsString("ricettine-test-index")));
	}

	@Test
	void deepLinkServesIndex() throws Exception {
		for (String path : new String[] {"/r/abc123", "/settings/profile"}) {
			mvc.perform(get(path))
					.andExpect(status().isOk())
					.andExpect(content().string(org.hamcrest.Matchers.containsString("ricettine-test-index")));
		}
	}

	@Test
	@WithMockUser
	void unknownApiIs404Json() throws Exception {
		mvc.perform(get("/api/nope"))
				.andExpect(status().isNotFound())
				.andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_PROBLEM_JSON));
	}

	@Test
	void missingAssetIs404() throws Exception {
		mvc.perform(get("/missing.js")).andExpect(status().isNotFound());
	}

	@Test
	void backendPathsAreClosedToAnonymous() throws Exception {
		for (String path : new String[] {"/api/nope", "/api", "/actuator", "/actuator/info"}) {
			mvc.perform(get(path)).andExpect(status().isUnauthorized());
		}
	}

	@Test
	void bareMediaIsNotIndex() throws Exception {
		mvc.perform(get("/media").with(org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.user("u")))
				.andExpect(status().isNotFound());
	}

	@Test
	void nonGetOnSpaPathsIsNotPermitted() throws Exception {
		for (String path : new String[] {"/", "/r/x"}) {
			mvc.perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post(path)
					.with(org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf()))
					.andExpect(status().isUnauthorized());
		}
	}

	@Test
	void caseVariantAndEncodedApiPathsAreNotPermittedSpaPaths() throws Exception {
		for (String path : new String[] {"/API/x", "/API/me", "/%61pi/me", "/%61pi/x", "/Api", "/MEDIA/x", "/ACTUATOR/info"}) {
			int s = mvc.perform(get(path)).andReturn().getResponse().getStatus();
			org.assertj.core.api.Assertions.assertThat(s).as(path).isIn(400, 401, 404);
		}
	}
}

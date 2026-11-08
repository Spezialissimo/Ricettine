package com.ricettine.config;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.ricettine.IntegrationTest;
import java.util.LinkedHashMap;
import java.util.Map;
import org.hamcrest.Matchers;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.security.test.context.support.WithMockUser;
import org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors;
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders;
import org.springframework.test.web.servlet.result.MockMvcResultMatchers;

class SpaFallbackIT extends IntegrationTest {

	@Test
	void rootServesIndex() throws Exception {
		mvc.perform(get("/"))
				.andExpect(status().isOk())
				.andExpect(content().string(Matchers.containsString("ricettine-test-index")));
	}

	@Test
	void deepLinkServesIndex() throws Exception {
		for (String path : new String[] {"/r/abc123", "/settings/profile"}) {
			mvc.perform(get(path))
					.andExpect(status().isOk())
					.andExpect(content().string(Matchers.containsString("ricettine-test-index")));
		}
	}

	@Test
	void indexIsNotCachedAtRootOrOnDeepLinks() throws Exception {
		for (String path : new String[] {"/", "/r/abc123", "/index.html"}) {
			mvc.perform(get(path))
					.andExpect(status().isOk())
					.andExpect(MockMvcResultMatchers.header()
							.string("Cache-Control", "no-cache"));
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
		mvc.perform(get("/media").with(SecurityMockMvcRequestPostProcessors.user("u")))
				.andExpect(status().isNotFound());
	}

	@Test
	void nonGetOnSpaPathsIsNotPermitted() throws Exception {
		for (String path : new String[] {"/", "/r/x"}) {
			mvc.perform(MockMvcRequestBuilders.post(path)
					.with(SecurityMockMvcRequestPostProcessors.csrf()))
					.andExpect(status().isUnauthorized());
		}
	}

	/** Case variants are not the /api, /media or /actuator prefixes, so they stay closed (401); %61 is a bad request. */
	@Test
	void caseVariantAndEncodedApiPathsAreNotPermittedSpaPaths() throws Exception {
		Map<String, Integer> expected = new LinkedHashMap<>();
		for (String path : new String[] {"/API/x", "/API/me", "/Api", "/MEDIA/x", "/ACTUATOR/info"}) {
			expected.put(path, 401);
		}
		expected.put("/%61pi/me", 400);
		expected.put("/%61pi/x", 400);
		for (Map.Entry<String, Integer> e : expected.entrySet()) {
			assertThat(mvc.perform(get(e.getKey())).andReturn().getResponse().getStatus()).as(e.getKey())
				.isEqualTo(e.getValue());
		}
	}
}

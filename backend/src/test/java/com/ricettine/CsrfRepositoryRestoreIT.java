package com.ricettine;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;

import org.junit.jupiter.api.MethodOrderer;
import org.junit.jupiter.api.Order;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.TestMethodOrder;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.security.test.web.support.WebTestUtils;
import org.springframework.security.web.csrf.CookieCsrfTokenRepository;
import org.springframework.security.web.csrf.CsrfTokenRepository;
import org.springframework.web.context.WebApplicationContext;

/**
 * MockMvc's csrf() swaps the token repository of the CsrfFilter in the shared Spring context. IntegrationTest puts the
 * production repository back after every test; this pins that, using two tests that must run in this order.
 */
@TestMethodOrder(MethodOrderer.OrderAnnotation.class)
class CsrfRepositoryRestoreIT extends IntegrationTest {

	@Autowired WebApplicationContext context;

	private CsrfTokenRepository repository() {
		return WebTestUtils.getCsrfTokenRepository(new MockHttpServletRequest(context.getServletContext()));
	}

	@Test
	@Order(1)
	void csrfPostProcessorSwapsTheRepository() throws Exception {
		assertThat(repository()).isInstanceOf(CookieCsrfTokenRepository.class);
		mvc.perform(post("/api/auth/logout").with(csrf()));
		assertThat(repository()).as("the leak this test guards against").isNotInstanceOf(CookieCsrfTokenRepository.class);
	}

	@Test
	@Order(2)
	void csrfRepositoryRestoredAfterTest() {
		assertThat(repository()).isInstanceOf(CookieCsrfTokenRepository.class);
	}
}

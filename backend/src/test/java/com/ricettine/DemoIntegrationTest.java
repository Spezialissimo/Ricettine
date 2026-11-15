package com.ricettine;

import org.springframework.test.context.TestPropertySource;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;
import com.ricettine.site.Site;
import com.ricettine.site.SiteContext;
import com.ricettine.site.SiteFilter;
import org.junit.jupiter.api.BeforeEach;

/** Integration tests that run with the demo site enabled (a second database in the same Postgres). */
@TestPropertySource(properties = { "ricettine.demo.enabled=true", "ricettine.demo.url=http://demo.test" })
public abstract class DemoIntegrationTest extends IntegrationTest {

	/** Marks the request as addressed to the demo site. */
	protected static MockHttpServletRequestBuilder demo(MockHttpServletRequestBuilder request) {
		return request.header(SiteFilter.HEADER, "demo");
	}

	@BeforeEach
	void resetDemoDatabase() {
		SiteContext.runAs(Site.DEMO, this::truncateAll);
	}
}

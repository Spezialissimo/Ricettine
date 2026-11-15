package com.ricettine.site;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import jakarta.servlet.DispatcherType;
import jakarta.servlet.ServletException;
import java.util.concurrent.atomic.AtomicReference;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;

class SiteFilterTest {

	private static DemoProperties props(boolean enabled) {
		return new DemoProperties(enabled, null, null, 0);
	}

	private static Site siteSeenFor(boolean enabled, String header) throws Exception {
		MockHttpServletRequest request = new MockHttpServletRequest();
		if (header != null) {
			request.addHeader(SiteFilter.HEADER, header);
		}
		AtomicReference<Site> seen = new AtomicReference<>();
		new SiteFilter(props(enabled)).doFilter(request, new MockHttpServletResponse(),
				(req, res) -> seen.set(SiteContext.current()));
		return seen.get();
	}

	@Test
	void demoHeaderSelectsDemoWhenEnabled() throws Exception {
		assertThat(siteSeenFor(true, "demo")).isEqualTo(Site.DEMO);
		assertThat(siteSeenFor(true, "DeMo")).isEqualTo(Site.DEMO);
	}

	@Test
	void demoSiteAppliesToErrorAndAsyncDispatches() throws Exception {
		for (DispatcherType type : new DispatcherType[] { DispatcherType.ERROR, DispatcherType.ASYNC }) {
			MockHttpServletRequest request = new MockHttpServletRequest();
			request.setDispatcherType(type);
			request.addHeader(SiteFilter.HEADER, "demo");
			AtomicReference<Site> seen = new AtomicReference<>();
			new SiteFilter(props(true)).doFilter(request, new MockHttpServletResponse(),
					(req, res) -> seen.set(SiteContext.current()));
			assertThat(seen.get()).as(type.name()).isEqualTo(Site.DEMO);
		}
	}

	@Test
	void demoHeaderIgnoredWhenDisabled() throws Exception {
		assertThat(siteSeenFor(false, "demo")).isEqualTo(Site.MAIN);
	}

	@Test
	void missingHeaderIsMain() throws Exception {
		assertThat(siteSeenFor(true, null)).isEqualTo(Site.MAIN);
	}

	@Test
	void unknownValueIsMain() throws Exception {
		for (String value : new String[] { "DEMO ", "main", "x" }) {
			assertThat(siteSeenFor(true, value)).as(value).isEqualTo(Site.MAIN);
		}
	}

	@Test
	void contextClearedAfterRequestEvenOnException() {
		MockHttpServletRequest request = new MockHttpServletRequest();
		request.addHeader(SiteFilter.HEADER, "demo");
		assertThatThrownBy(() -> new SiteFilter(props(true)).doFilter(request, new MockHttpServletResponse(),
				(req, res) -> {
					assertThat(SiteContext.current()).isEqualTo(Site.DEMO);
					throw new ServletException("boom");
				})).isInstanceOf(ServletException.class);
		assertThat(SiteContext.current()).isEqualTo(Site.MAIN);
	}

	@Test
	void demoPropertiesDefaultsAndBlankUrl() {
		DemoProperties p = new DemoProperties(false, "  ", null, 0);
		assertThat(p.url()).isNull();
		assertThat(p.database()).isEqualTo("ricettine_demo");
		assertThat(p.poolSize()).isEqualTo(3);
	}
}

package com.ricettine.common;

import static org.assertj.core.api.Assertions.assertThat;

import com.ricettine.site.DemoProperties;
import com.ricettine.site.Site;
import com.ricettine.site.SiteContext;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.web.context.request.RequestContextHolder;
import org.springframework.web.context.request.ServletRequestAttributes;

class PublicUrlsTest {

	@AfterEach
	void clearRequest() {
		RequestContextHolder.resetRequestAttributes();
	}

	private static void request(String scheme, String host, int port, String contextPath) {
		MockHttpServletRequest request = new MockHttpServletRequest();
		request.setScheme(scheme);
		request.setServerName(host);
		request.setServerPort(port);
		request.setContextPath(contextPath);
		RequestContextHolder.setRequestAttributes(new ServletRequestAttributes(request));
	}

	@Test
	void blankBaseIsDerivedFromTheRequest() {
		request("http", "localhost", 80, "");
		assertThat(new PublicUrls("").base()).isEqualTo("http://localhost");
		assertThat(new PublicUrls("   ").base()).isEqualTo("http://localhost");
	}

	@Test
	void derivedBaseKeepsSchemeHostNonDefaultPortAndContextPath() {
		request("https", "recipes.example.com", 8443, "/app");
		assertThat(new PublicUrls("").base()).isEqualTo("https://recipes.example.com:8443/app");
	}

	@Test
	void configuredBaseWinsOverTheRequest() {
		request("http", "localhost", 80, "");
		assertThat(new PublicUrls("https://cook.example.org").base()).isEqualTo("https://cook.example.org");
	}

	@Test
	void configuredBaseLosesItsTrailingSlashAndWhitespace() {
		request("http", "localhost", 80, "");
		assertThat(new PublicUrls("https://cook.example.org/").base()).isEqualTo("https://cook.example.org");
		assertThat(new PublicUrls("  https://cook.example.org/  ").base()).isEqualTo("https://cook.example.org");
		assertThat(new PublicUrls("https://example.org/ricettine/").base()).isEqualTo("https://example.org/ricettine");
	}

	@Test
	void demoWithoutDemoUrlDerivesFromTheRequestNotTheMainBaseUrl() {
		request("https", "demo.example.com", 443, "");
		String base = SiteContext.callAs(Site.DEMO,
				() -> new PublicUrls("https://cook.example.org", new DemoProperties(true, null, null, 0)).base());
		assertThat(base).isEqualTo("https://demo.example.com");
	}

	@Test
	void demoUrlWinsOnTheDemoSite() {
		request("http", "localhost", 80, "");
		String base = SiteContext.callAs(Site.DEMO, () -> new PublicUrls("https://cook.example.org",
				new DemoProperties(true, "https://demo.example.org/", null, 0)).base());
		assertThat(base).isEqualTo("https://demo.example.org");
	}
}

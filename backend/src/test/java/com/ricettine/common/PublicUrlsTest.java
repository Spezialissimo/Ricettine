package com.ricettine.common;

import static org.assertj.core.api.Assertions.assertThat;

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
}

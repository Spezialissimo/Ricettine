package com.ricettine.common;

import com.ricettine.site.DemoProperties;
import com.ricettine.site.Site;
import com.ricettine.site.SiteContext;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;
import org.springframework.web.servlet.support.ServletUriComponentsBuilder;

/** Public base URL for links handed to users: {@code ricettine.base-url} if set, else derived from the request. */
@Component
public class PublicUrls {

	private final String configuredBaseUrl;

	private final DemoProperties demo;

	public PublicUrls(String configuredBaseUrl) {
		this(configuredBaseUrl, null);
	}

	@Autowired
	public PublicUrls(@Value("${ricettine.base-url:}") String configuredBaseUrl, DemoProperties demo) {
		this.configuredBaseUrl = configuredBaseUrl;
		this.demo = demo;
	}

	/** Base without a trailing slash. Must be called within a request. */
	public String base() {
		String base = SiteContext.current() == Site.DEMO && demo != null && demo.url() != null ? demo.url()
				: configuredBaseUrl.isBlank() ? ServletUriComponentsBuilder.fromCurrentContextPath()
			.build().toUriString() : configuredBaseUrl.trim();
		return base.endsWith("/") ? base.substring(0, base.length() - 1) : base;
	}
}

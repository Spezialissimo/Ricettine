package com.ricettine.common;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;
import org.springframework.web.servlet.support.ServletUriComponentsBuilder;

/** Public base URL for links handed to users: {@code ricettine.base-url} if set, else derived from the request. */
@Component
public class PublicUrls {

	private final String configuredBaseUrl;

	public PublicUrls(@Value("${ricettine.base-url:}") String configuredBaseUrl) {
		this.configuredBaseUrl = configuredBaseUrl;
	}

	/** Base without a trailing slash. Must be called within a request. */
	public String base() {
		String base = configuredBaseUrl.isBlank() ? ServletUriComponentsBuilder.fromCurrentContextPath()
			.build().toUriString() : configuredBaseUrl.trim();
		return base.endsWith("/") ? base.substring(0, base.length() - 1) : base;
	}
}

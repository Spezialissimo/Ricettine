package com.ricettine.site;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

/** Binds the request's {@link Site}: DEMO only when the demo is enabled and the site header says {@code demo}. */
@Component
@Order(Ordered.HIGHEST_PRECEDENCE)
public class SiteFilter extends OncePerRequestFilter {

	public static final String HEADER = "X-Ricettine-Site";

	private final DemoProperties demo;

	public SiteFilter(DemoProperties demo) {
		this.demo = demo;
	}

	@Override
	protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain chain)
			throws ServletException, IOException {
		boolean isDemo = demo.enabled() && "demo".equalsIgnoreCase(request.getHeader(HEADER));
		SiteContext.set(isDemo ? Site.DEMO : Site.MAIN);
		try {
			chain.doFilter(request, response);
		}
		finally {
			SiteContext.clear();
		}
	}
}

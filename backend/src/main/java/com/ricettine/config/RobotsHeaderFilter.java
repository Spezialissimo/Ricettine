package com.ricettine.config;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

/**
 * Adds {@code X-Robots-Tag: noindex, nofollow} to every response. The instance is invite-only, so nothing on it is
 * meant for search engines. Runs before Spring Security, so 401/403 responses written by it carry the header too.
 * There is deliberately no robots.txt Disallow: a disallowed crawler would never see the noindex.
 */
@Component
@Order(Ordered.HIGHEST_PRECEDENCE)
class RobotsHeaderFilter extends OncePerRequestFilter {

	static final String VALUE = "noindex, nofollow";

	@Override
	protected boolean shouldNotFilterAsyncDispatch() {
		return false;
	}

	@Override
	protected boolean shouldNotFilterErrorDispatch() {
		return false;
	}

	@Override
	protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain chain)
			throws ServletException, IOException {
		response.setHeader("X-Robots-Tag", VALUE);
		chain.doFilter(request, response);
	}
}

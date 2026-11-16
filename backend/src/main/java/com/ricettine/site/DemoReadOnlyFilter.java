package com.ricettine.site;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.util.Set;
import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

/**
 * The demo site is read-only: any method other than GET, HEAD or OPTIONS is refused with 403 {@code demo_read_only}.
 * Runs right after {@link SiteFilter} and before Spring Session and Spring Security, so a refused request creates
 * no session and passes no authentication. The two exceptions are matched on the exact request URI (no trailing
 * slash, path parameter or case variant gets through: such a request is refused). Methods are compared exactly
 * (HTTP methods are case-sensitive), so a lower-case {@code get} is not safe.
 */
@Component
@Order(Ordered.HIGHEST_PRECEDENCE + 1)
public class DemoReadOnlyFilter extends OncePerRequestFilter {

	private static final Set<String> SAFE_METHODS = Set.of("GET", "HEAD", "OPTIONS");
	private static final Set<String> ALLOWED_WRITES = Set.of("/api/demo/session", "/api/auth/logout");

	private final boolean readOnly;

	public DemoReadOnlyFilter(DemoProperties demo) {
		this.readOnly = demo.readOnly();
	}

	@Override
	protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain chain)
			throws ServletException, IOException {
		if (!readOnly || SiteContext.current() != Site.DEMO || SAFE_METHODS.contains(request.getMethod())
				|| isAllowedWrite(request)) {
			chain.doFilter(request, response);
			return;
		}
		response.setStatus(HttpStatus.FORBIDDEN.value());
		response.setContentType(MediaType.APPLICATION_PROBLEM_JSON_VALUE);
		response.setCharacterEncoding("UTF-8");
		response.getWriter().write("{\"type\":\"about:blank\",\"title\":\"Forbidden\",\"status\":403,"
				+ "\"code\":\"demo_read_only\"}");
	}

	private static boolean isAllowedWrite(HttpServletRequest request) {
		if (!"POST".equals(request.getMethod())) {
			return false;
		}
		String uri = request.getRequestURI();
		String context = request.getContextPath();
		if (uri == null || !uri.startsWith(context)) {
			return false;
		}
		return ALLOWED_WRITES.contains(uri.substring(context.length()));
	}
}

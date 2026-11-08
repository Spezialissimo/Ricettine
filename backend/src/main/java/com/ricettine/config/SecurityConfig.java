package com.ricettine.config;

import jakarta.servlet.http.HttpServletResponse;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.core.annotation.Order;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configurers.HeadersConfigurer;
import org.springframework.security.web.header.writers.ReferrerPolicyHeaderWriter.ReferrerPolicy;
import org.springframework.security.web.AuthenticationEntryPoint;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.access.AccessDeniedHandler;
import org.springframework.security.web.authentication.logout.LogoutSuccessHandler;
import org.springframework.security.web.csrf.CookieCsrfTokenRepository;
import org.springframework.security.web.csrf.CsrfTokenRepository;
import org.springframework.security.web.util.matcher.RegexRequestMatcher;

@Configuration
public class SecurityConfig {

	private static final String CSP = "default-src 'self'; img-src 'self' data: blob:; style-src 'self' 'unsafe-inline'; "
			+ "object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'";

	private static void securityHeaders(HeadersConfigurer<HttpSecurity> h) {
		h.contentSecurityPolicy(c -> c.policyDirectives(CSP)).referrerPolicy(r -> r.policy(ReferrerPolicy.SAME_ORIGIN));
	}

	/**
	 * Media is public, immutable and cacheable by an edge: this GET-only chain has no CSRF handling, so a response
	 * never carries an XSRF-TOKEN Set-Cookie that a shared cache could hand to every viewer.
	 */
	@Bean
	@Order(1)
	SecurityFilterChain mediaFilterChain(HttpSecurity http) throws Exception {
		http.securityMatcher("/media/**")
			.authorizeHttpRequests(auth -> auth
				.requestMatchers(HttpMethod.GET, "/media/**").permitAll()
				.anyRequest().authenticated())
			.csrf(csrf -> csrf.disable())
			.headers(SecurityConfig::securityHeaders)
			.exceptionHandling(e -> e
				.authenticationEntryPoint(entryPoint())
				.accessDeniedHandler(accessDenied()));
		return http.build();
	}

	@Bean
	@Order(2)
	SecurityFilterChain securityFilterChain(HttpSecurity http) throws Exception {
		CsrfTokenRepository csrfTokens = CookieCsrfTokenRepository.withHttpOnlyFalse();
		http.authorizeHttpRequests(auth -> auth
				.requestMatchers("/actuator/health", "/actuator/health/**").permitAll()
				.requestMatchers("/api/setup/**").permitAll()
				.requestMatchers(HttpMethod.POST, "/api/auth/login").permitAll()
				.requestMatchers(HttpMethod.GET, "/api/invites/*").permitAll()
				.requestMatchers(HttpMethod.POST, "/api/invites/*/register").permitAll()
				.requestMatchers(HttpMethod.POST, "/api/password-resets/*").permitAll()
				.requestMatchers(HttpMethod.GET, "/api/r/*").permitAll()
				.requestMatchers(HttpMethod.GET, "/api/c/**").permitAll()
				.requestMatchers(HttpMethod.GET, "/media/**").permitAll()
				// SPA paths: everything except the backend prefixes (case-insensitive so /API/x is not a SPA path)
				.requestMatchers(RegexRequestMatcher.regexMatcher(HttpMethod.GET,
						"^/(?!(?i:api|media|actuator)(/|$)).*"))
					.permitAll()
				.requestMatchers("/api/admin/**").hasRole("ADMIN")
				.anyRequest().authenticated())
			.headers(SecurityConfig::securityHeaders)
			.csrf(csrf -> csrf.spa().csrfTokenRepository(csrfTokens))
			.logout(l -> l.logoutUrl("/api/auth/logout").logoutSuccessHandler(logoutSuccess(csrfTokens)))
			.exceptionHandling(e -> e
				.authenticationEntryPoint(entryPoint())
				.accessDeniedHandler(accessDenied()));
		return http.build();
	}

	/**
	 * Logout clears the XSRF cookie (CsrfLogoutHandler); the SPA then goes to /login without any GET, so the 204
	 * carries a fresh token and the next login POST passes CSRF.
	 */
	private static LogoutSuccessHandler logoutSuccess(CsrfTokenRepository csrfTokens) {
		return (req, res, auth) -> {
			csrfTokens.saveToken(csrfTokens.generateToken(req), req, res);
			res.setStatus(HttpStatus.NO_CONTENT.value());
		};
	}

	private static AuthenticationEntryPoint entryPoint() {
		return (req, res, ex) -> problem(res, HttpStatus.UNAUTHORIZED, "not_authenticated");
	}

	private static AccessDeniedHandler accessDenied() {
		return (req, res, ex) -> problem(res, HttpStatus.FORBIDDEN, "forbidden");
	}

	private static void problem(HttpServletResponse res, HttpStatus status, String code) throws java.io.IOException {
		res.setStatus(status.value());
		res.setContentType(MediaType.APPLICATION_PROBLEM_JSON_VALUE);
		res.setCharacterEncoding("UTF-8");
		res.getWriter().write("{\"type\":\"about:blank\",\"title\":\"%s\",\"status\":%d,\"code\":\"%s\"}"
				.formatted(status.getReasonPhrase(), status.value(), code));
	}
}

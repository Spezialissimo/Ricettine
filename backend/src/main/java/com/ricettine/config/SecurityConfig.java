package com.ricettine.config;

import jakarta.servlet.http.HttpServletResponse;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.web.AuthenticationEntryPoint;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.access.AccessDeniedHandler;
import org.springframework.security.web.authentication.logout.HttpStatusReturningLogoutSuccessHandler;
import org.springframework.security.web.util.matcher.RegexRequestMatcher;

@Configuration
public class SecurityConfig {

	@Bean
	SecurityFilterChain securityFilterChain(HttpSecurity http) throws Exception {
		http.authorizeHttpRequests(auth -> auth
				.requestMatchers("/actuator/health", "/actuator/health/**").permitAll()
				.requestMatchers("/api/setup/**").permitAll()
				.requestMatchers(HttpMethod.POST, "/api/auth/login").permitAll()
				.requestMatchers(HttpMethod.GET, "/api/invites/*").permitAll()
				.requestMatchers(HttpMethod.POST, "/api/invites/*/register").permitAll()
				.requestMatchers(HttpMethod.POST, "/api/password-resets/*").permitAll()
				.requestMatchers(HttpMethod.GET, "/media/**").permitAll()
				// SPA paths: everything except the backend prefixes (case-insensitive so /API/x is not a SPA path)
				.requestMatchers(RegexRequestMatcher.regexMatcher(HttpMethod.GET,
						"^/(?!(?i:api|media|actuator)(/|$)).*"))
					.permitAll()
				.requestMatchers("/api/admin/**").hasRole("ADMIN")
				.anyRequest().authenticated())
			.csrf(csrf -> csrf.spa())
			.logout(l -> l.logoutUrl("/api/auth/logout")
				.logoutSuccessHandler(new HttpStatusReturningLogoutSuccessHandler(HttpStatus.NO_CONTENT)))
			.exceptionHandling(e -> e
				.authenticationEntryPoint(entryPoint())
				.accessDeniedHandler(accessDenied()));
		return http.build();
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

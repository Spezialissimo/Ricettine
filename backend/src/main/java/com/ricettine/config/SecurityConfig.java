package com.ricettine.config;

import org.springframework.context.annotation.Bean;
import org.springframework.http.HttpMethod;
import org.springframework.context.annotation.Configuration;
import org.springframework.security.config.Customizer;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.util.matcher.RegexRequestMatcher;

@Configuration
public class SecurityConfig {

	@Bean
	SecurityFilterChain securityFilterChain(HttpSecurity http) throws Exception {
		http.authorizeHttpRequests(auth -> auth
				.requestMatchers("/actuator/health", "/actuator/health/**").permitAll()
				.requestMatchers(RegexRequestMatcher.regexMatcher(HttpMethod.GET, "^/(?!(api|media|actuator)(/|$)).*"))
					.permitAll()
				.anyRequest().authenticated())
			.httpBasic(Customizer.withDefaults());
		return http.build();
	}
}

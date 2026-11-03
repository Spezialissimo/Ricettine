package com.ricettine.config;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.security.crypto.factory.PasswordEncoderFactories;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.session.web.http.CookieSerializer;
import org.springframework.session.web.http.DefaultCookieSerializer;

@Configuration
public class BeansConfig {

	/**
	 * Session cookie: HttpOnly, SameSite=Lax, 30 days. Secure is left unset so it follows request.isSecure()
	 * (correct behind a TLS proxy thanks to server.forward-headers-strategy=framework).
	 */
	@Bean
	CookieSerializer cookieSerializer() {
		DefaultCookieSerializer serializer = new DefaultCookieSerializer();
		serializer.setCookieName("SESSION");
		serializer.setUseHttpOnlyCookie(true);
		serializer.setSameSite("Lax");
		serializer.setCookieMaxAge((int) java.time.Duration.ofDays(30).toSeconds());
		return serializer;
	}

	@Bean
	PasswordEncoder passwordEncoder() {
		return PasswordEncoderFactories.createDelegatingPasswordEncoder();
	}
}

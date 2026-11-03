package com.ricettine.config;

import java.time.Duration;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import java.util.HashMap;
import java.util.Map;
import org.springframework.security.crypto.argon2.Argon2PasswordEncoder;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.security.crypto.password.DelegatingPasswordEncoder;
import org.springframework.security.crypto.password.Pbkdf2PasswordEncoder;
import org.springframework.security.crypto.scrypt.SCryptPasswordEncoder;
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

	/** How long a request waits for a hashing slot before it gets 503 {@code busy}. */
	static final Duration HASH_WAIT = Duration.ofSeconds(10);

	@Bean
	PasswordEncoder passwordEncoder(@Value("${ricettine.security.max-concurrent-hashes:4}") int maxConcurrentHashes) {
		// Argon2 for new hashes (bcrypt silently caps at 72 bytes and throws beyond); {bcrypt} hashes still verify.
		Map<String, PasswordEncoder> encoders = new HashMap<>();
		encoders.put("argon2", Argon2PasswordEncoder.defaultsForSpringSecurity_v5_8());
		encoders.put("bcrypt", new BCryptPasswordEncoder());
		encoders.put("pbkdf2@SpringSecurity_v5_8", Pbkdf2PasswordEncoder.defaultsForSpringSecurity_v5_8());
		encoders.put("scrypt@SpringSecurity_v5_8", SCryptPasswordEncoder.defaultsForSpringSecurity_v5_8());
		// Bounded: argon2 needs ~16 MB per hash and /api/auth/login is unauthenticated.
		return new BoundedPasswordEncoder(new DelegatingPasswordEncoder("argon2", encoders), maxConcurrentHashes,
				HASH_WAIT);
	}
}

package com.ricettine.config;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Optional;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.web.servlet.FilterRegistrationBean;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.core.Ordered;
import org.springframework.web.filter.OncePerRequestFilter;

/**
 * Owns the multipart spool directory ({@code spring.servlet.multipart.location}): created at startup, and re-created
 * before every multipart request in case a tmp cleaner removed it while the app was running.
 */
@Configuration
public class UploadDirectoryConfig {

	private static final Logger log = LoggerFactory.getLogger(UploadDirectoryConfig.class);

	/** Only a non-blank absolute location is ours; Tomcat resolves any other against its own work directory. */
	static Optional<Path> managedDirectory(String location) {
		if (location == null || location.isBlank()) {
			return Optional.empty();
		}
		Path p = Path.of(location);
		return p.isAbsolute() ? Optional.of(p) : Optional.empty();
	}

	@Bean
	FilterRegistrationBean<OncePerRequestFilter> uploadDirectoryFilter(
			@Value("${spring.servlet.multipart.location:}") String location) throws IOException {
		Optional<Path> managed = managedDirectory(location);
		if (managed.isEmpty()) {
			log.info("Multipart location '{}' is blank or relative: Tomcat manages the spool directory", location);
			FilterRegistrationBean<OncePerRequestFilter> off = new FilterRegistrationBean<>();
			off.setEnabled(false);
			return off;
		}
		Path dir = managed.get();
		Files.createDirectories(dir);
		FilterRegistrationBean<OncePerRequestFilter> reg = new FilterRegistrationBean<>(new OncePerRequestFilter() {
			@Override
			protected boolean shouldNotFilter(HttpServletRequest request) {
				String ct = request.getContentType();
				return ct == null || !ct.regionMatches(true, 0, "multipart/", 0, 10);
			}

			@Override
			protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response,
					FilterChain chain) throws ServletException, IOException {
				Files.createDirectories(dir); // no-op when it exists
				chain.doFilter(request, response);
			}
		});
		reg.setOrder(Ordered.HIGHEST_PRECEDENCE); // before Spring Security, which may parse the body
		return reg;
	}
}

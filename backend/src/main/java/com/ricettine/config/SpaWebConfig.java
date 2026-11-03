package com.ricettine.config;

import java.io.IOException;
import java.time.Duration;
import java.util.List;
import org.springframework.context.annotation.Configuration;
import org.springframework.core.io.ClassPathResource;
import org.springframework.core.io.Resource;
import org.springframework.http.CacheControl;
import org.springframework.web.servlet.config.annotation.ResourceHandlerRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;
import org.springframework.web.servlet.resource.PathResourceResolver;

/** Serves the Angular build from classpath:/static and falls back to index.html for deep links. */
@Configuration
public class SpaWebConfig implements WebMvcConfigurer {

	private static final List<String> BACKEND_PREFIXES = List.of("api", "media", "actuator");

	@Override
	public void addResourceHandlers(ResourceHandlerRegistry registry) {
		// Angular emits content-hashed bundles (main-XXXX.js, chunk-XXXX.js, styles-XXXX.css): cache them for a year.
		registry.addResourceHandler("/*-*.js", "/*-*.css")
				.addResourceLocations("classpath:/static/")
				.setCacheControl(CacheControl.maxAge(Duration.ofDays(365)).cachePublic().immutable());
		// Everything else, index.html (incl. the deep-link fallback) in particular, must be revalidated.
		registry.addResourceHandler("/**")
				.addResourceLocations("classpath:/static/")
				.setCacheControl(CacheControl.noCache())
				.resourceChain(false)
				.addResolver(new PathResourceResolver() {
					@Override
					protected Resource getResource(String resourcePath, Resource location) throws IOException {
						Resource requested = location.createRelative(resourcePath);
						if (!resourcePath.isEmpty() && !resourcePath.endsWith("/") && requested.exists() && requested.isReadable()) {
							return requested;
						}
						if (isSpaRoute(resourcePath)) {
							Resource index = new ClassPathResource("static/index.html");
							return index.exists() ? index : null;
						}
						return null;
					}
				});
	}

	static boolean isSpaRoute(String path) {
		String first = path.contains("/") ? path.substring(0, path.indexOf('/')) : path;
		if (BACKEND_PREFIXES.contains(first)) {
			return false;
		}
		String last = path.substring(path.lastIndexOf('/') + 1);
		return !last.contains(".");
	}
}

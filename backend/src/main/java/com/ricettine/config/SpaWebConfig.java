package com.ricettine.config;

import java.io.IOException;
import java.util.List;
import org.springframework.context.annotation.Configuration;
import org.springframework.core.io.ClassPathResource;
import org.springframework.core.io.Resource;
import org.springframework.web.servlet.config.annotation.ResourceHandlerRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;
import org.springframework.web.servlet.resource.PathResourceResolver;

/** Serves the Angular build from classpath:/static and falls back to index.html for deep links. */
@Configuration
public class SpaWebConfig implements WebMvcConfigurer {

	private static final List<String> BACKEND_PREFIXES = List.of("api/", "media/", "actuator/");

	@Override
	public void addResourceHandlers(ResourceHandlerRegistry registry) {
		registry.addResourceHandler("/**")
				.addResourceLocations("classpath:/static/")
				.resourceChain(true)
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
		for (String prefix : BACKEND_PREFIXES) {
			if (path.startsWith(prefix)) {
				return false;
			}
		}
		String last = path.substring(path.lastIndexOf('/') + 1);
		return !last.contains(".");
	}
}

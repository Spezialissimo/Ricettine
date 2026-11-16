package com.ricettine.site;

import org.springframework.boot.context.properties.ConfigurationProperties;

/**
 * Public demo settings. {@code url} is the public demo site URL (not a JDBC URL); blank database and non-positive
 * pool size fall back to the defaults.
 */
@ConfigurationProperties("ricettine.demo")
public record DemoProperties(boolean enabled, String url, String database, int poolSize) {

	static final String DEFAULT_DATABASE = "ricettine_demo";
	static final int DEFAULT_POOL_SIZE = 3;

	public DemoProperties {
		url = url == null || url.isBlank() ? null : url.trim();
		database = database == null || database.isBlank() ? DEFAULT_DATABASE : database.trim();
		poolSize = poolSize <= 0 ? DEFAULT_POOL_SIZE : poolSize;
	}
}

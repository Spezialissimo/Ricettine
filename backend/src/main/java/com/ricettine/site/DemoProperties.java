package com.ricettine.site;

import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.boot.context.properties.bind.ConstructorBinding;

/**
 * Public demo settings. {@code url} is the public demo site URL (not a JDBC URL); blank database and non-positive
 * pool size fall back to the defaults. {@code readOnly} (default true) guards the demo site against writes; it exists
 * only so tests can write to the demo database and must stay true in production.
 */
@ConfigurationProperties("ricettine.demo")
public record DemoProperties(boolean enabled, String url, String database, int poolSize,
		boolean readOnly) {

	static final String DEFAULT_DATABASE = "ricettine_demo";
	static final int DEFAULT_POOL_SIZE = 3;

	/** Read-only demo, as in production. */
	public DemoProperties(boolean enabled, String url, String database, int poolSize) {
		this(enabled, url, database, poolSize, true);
	}

	@ConstructorBinding
	public DemoProperties {
		url = url == null || url.isBlank() ? null : url.trim();
		database = database == null || database.isBlank() ? DEFAULT_DATABASE : database.trim();
		poolSize = poolSize <= 0 ? DEFAULT_POOL_SIZE : poolSize;
	}
}

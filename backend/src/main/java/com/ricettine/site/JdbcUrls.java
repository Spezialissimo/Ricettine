package com.ricettine.site;

import java.util.regex.Matcher;
import java.util.regex.Pattern;

/** JDBC URL helpers. */
public final class JdbcUrls {

	// prefix (scheme, host, port) / database [?query]
	private static final Pattern URL = Pattern.compile("^(jdbc:[^/]+//[^/?]+)/([^/?]+)/?(\\?.*)?$");

	private JdbcUrls() {
	}

	/** Replaces the database name in {@code jdbcUrl}, keeping the query string. */
	public static String withDatabase(String jdbcUrl, String database) {
		Matcher m = jdbcUrl == null ? null : URL.matcher(jdbcUrl);
		if (m == null || !m.matches()) {
			throw new IllegalArgumentException("JDBC URL has no database name: " + jdbcUrl);
		}
		return m.group(1) + "/" + database + (m.group(3) == null ? "" : m.group(3));
	}
}

package com.ricettine.site;

import java.sql.Connection;
import java.sql.SQLException;
import java.sql.Statement;
import java.util.regex.Pattern;
import javax.sql.DataSource;

/** Lifecycle of the demo database inside the main database server. */
public final class DemoDatabase {

	private static final Pattern NAME = Pattern.compile("^[a-z_][a-z0-9_]{0,62}$");

	private DemoDatabase() {
	}

	/** Drops (forcing other sessions off) and creates an empty database named {@code name}, through {@code main}. */
	public static void recreate(DataSource main, String name) {
		if (name == null || !NAME.matcher(name).matches()) {
			throw new IllegalArgumentException("Invalid demo database name: " + name);
		}
		try (Connection connection = main.getConnection(); Statement statement = connection.createStatement()) {
			connection.setAutoCommit(true);
			statement.execute("DROP DATABASE IF EXISTS \"" + name + "\" WITH (FORCE)");
			statement.execute("CREATE DATABASE \"" + name + "\"");
		}
		catch (SQLException e) {
			throw new IllegalStateException("Could not recreate demo database " + name, e);
		}
	}
}

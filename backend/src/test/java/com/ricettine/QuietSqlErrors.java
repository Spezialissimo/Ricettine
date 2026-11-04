package com.ricettine;

import ch.qos.logback.classic.Level;
import ch.qos.logback.classic.Logger;
import java.lang.annotation.ElementType;
import java.lang.annotation.Retention;
import java.lang.annotation.RetentionPolicy;
import java.lang.annotation.Target;
import org.junit.jupiter.api.extension.AfterEachCallback;
import org.junit.jupiter.api.extension.BeforeEachCallback;
import org.junit.jupiter.api.extension.ExtendWith;
import org.junit.jupiter.api.extension.ExtensionContext;
import org.slf4j.LoggerFactory;

/**
 * Silences Hibernate's JDBC error logging for tests that deliberately provoke a SQL error (e.g. a unique
 * violation). The previous level is restored afterwards, so unexpected SQL errors elsewhere still log.
 */
@Target({ ElementType.METHOD, ElementType.TYPE })
@Retention(RetentionPolicy.RUNTIME)
@ExtendWith(QuietSqlErrors.Extension.class)
public @interface QuietSqlErrors {

	class Extension implements BeforeEachCallback, AfterEachCallback {

		private static final String LOGGER = "org.hibernate.orm.jdbc.error";

		private static final ExtensionContext.Namespace NS = ExtensionContext.Namespace.create(Extension.class);

		@Override
		public void beforeEach(ExtensionContext context) {
			Logger logger = (Logger) LoggerFactory.getLogger(LOGGER);
			context.getStore(NS).put("previous", logger.getLevel());
			context.getStore(NS).put("saved", Boolean.TRUE);
			logger.setLevel(Level.OFF);
		}

		@Override
		public void afterEach(ExtensionContext context) {
			if (context.getStore(NS).get("saved") != null) {
				((Logger) LoggerFactory.getLogger(LOGGER)).setLevel(context.getStore(NS).get("previous", Level.class));
			}
		}
	}
}

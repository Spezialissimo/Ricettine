package com.ricettine.site;

import com.zaxxer.hikari.HikariDataSource;
import javax.sql.DataSource;
import org.flywaydb.core.Flyway;
import org.flywaydb.core.api.output.MigrateResult;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.boot.jdbc.autoconfigure.DataSourceProperties;
import org.springframework.boot.context.properties.bind.Bindable;
import org.springframework.boot.context.properties.bind.Binder;
import org.springframework.boot.jdbc.DataSourceBuilder;
import org.springframework.boot.jdbc.autoconfigure.JdbcConnectionDetails;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Primary;
import org.springframework.core.env.Environment;

/**
 * The application DataSource is a router over a main pool and, when the demo is enabled, a demo pool in a second
 * database of the same server. The main pool is built exactly as Spring Boot would (connection details, then
 * {@code spring.datasource.hikari.*}); Flyway auto-config migrates it through the router, which is MAIN at startup.
 */
@Configuration
public class SiteDataSourceConfig {

	static final String MIGRATIONS = "classpath:db/migration";

	@Bean
	@Primary
	DataSource dataSource(ObjectProvider<JdbcConnectionDetails> detailsProvider, DataSourceProperties properties,
			DemoProperties demo, Environment environment) {
		// JdbcConnectionDetails exists only when a service connection (tests, Docker Compose) provides it; the
		// DataSourceAutoConfiguration one backs off because of this bean, so fall back to spring.datasource.*.
		JdbcConnectionDetails details = detailsProvider.getIfAvailable(() -> new PropertiesDetails(properties));
		HikariDataSource main = hikari(details, details.getJdbcUrl(), "main");
		Binder.get(environment).bind("spring.datasource.hikari", Bindable.ofInstance(main));
		if (!demo.enabled()) {
			return new SiteRoutingDataSource(main, null);
		}
		DemoDatabase.recreate(main, demo.database());
		HikariDataSource demoPool = hikari(details, JdbcUrls.withDatabase(details.getJdbcUrl(), demo.database()),
				"demo");
		demoPool.setMaximumPoolSize(demo.poolSize());
		return new SiteRoutingDataSource(main, demoPool);
	}

	/**
	 * Migrates the demo database on its own pool (not through routing). Not a {@link Flyway} bean: that would make
	 * Flyway auto-config back off and leave the main database unmigrated. Consumers use {@code @DependsOn}.
	 */
	@Bean
	@ConditionalOnProperty("ricettine.demo.enabled")
	MigrateResult demoFlyway(@Qualifier("dataSource") DataSource routing) {
		DataSource demoPool = ((SiteRoutingDataSource) routing).pool(Site.DEMO);
		return Flyway.configure().dataSource(demoPool).locations(MIGRATIONS).load().migrate();
	}

	private record PropertiesDetails(DataSourceProperties properties) implements JdbcConnectionDetails {

		@Override
		public String getJdbcUrl() {
			return properties.determineUrl();
		}

		@Override
		public String getUsername() {
			return properties.determineUsername();
		}

		@Override
		public String getPassword() {
			return properties.determinePassword();
		}

		@Override
		public String getDriverClassName() {
			return properties.determineDriverClassName();
		}
	}

	private static HikariDataSource hikari(JdbcConnectionDetails details, String url, String poolName) {
		HikariDataSource pool = DataSourceBuilder.create().type(HikariDataSource.class).url(url)
			.username(details.getUsername()).password(details.getPassword())
			.driverClassName(details.getDriverClassName()).build();
		pool.setPoolName(poolName);
		return pool;
	}
}

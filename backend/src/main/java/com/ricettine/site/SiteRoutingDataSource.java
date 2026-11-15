package com.ricettine.site;

import java.util.HashMap;
import java.util.Map;
import javax.sql.DataSource;
import com.zaxxer.hikari.HikariDataSource;
import org.springframework.jdbc.datasource.lookup.AbstractRoutingDataSource;

/**
 * Routes every connection to the pool of {@link SiteContext#current()}. A site without a pool fails loudly instead of
 * falling back to main, so data of one site can never land in the other database.
 */
public class SiteRoutingDataSource extends AbstractRoutingDataSource {

	private final Map<Site, DataSource> pools;

	public SiteRoutingDataSource(DataSource main, DataSource demo) {
		pools = new HashMap<>();
		pools.put(Site.MAIN, main);
		if (demo != null) {
			pools.put(Site.DEMO, demo);
		}
		setTargetDataSources(new HashMap<Object, Object>(pools));
		setDefaultTargetDataSource(main);
		setLenientFallback(false);
	}

	@Override
	protected Object determineCurrentLookupKey() {
		return SiteContext.current();
	}

	/** The pool of {@code site}, bypassing routing. */
	public DataSource pool(Site site) {
		return pools.get(site);
	}

	/** Closes the pools (inferred as the bean's destroy method). */
	public void close() {
		pools.values().forEach(pool -> {
			if (pool instanceof HikariDataSource hikari) {
				hikari.close();
			}
		});
	}
}

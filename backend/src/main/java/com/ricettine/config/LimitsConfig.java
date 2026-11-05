package com.ricettine.config;

import java.time.Duration;
import org.springframework.boot.context.properties.ConfigurationProperties;

/** {@code ricettine.limits.*}: abuse limits, each a count per fixed window. Defaults mirror application.yml. */
@ConfigurationProperties("ricettine.limits")
public class LimitsConfig {

	public static class Entry {
		private int limit;
		private Duration window;

		public Entry(int limit, Duration window) {
			this.limit = limit;
			this.window = window;
		}

		public int getLimit() {
			return limit;
		}

		public void setLimit(int limit) {
			this.limit = limit;
		}

		public Duration getWindow() {
			return window;
		}

		public void setWindow(Duration window) {
			this.window = window;
		}
	}

	private final Entry loginAccount = new Entry(10, Duration.ofMinutes(15));
	private final Entry loginIp = new Entry(30, Duration.ofMinutes(15));
	private final Entry anonymousAuth = new Entry(30, Duration.ofMinutes(15));
	private final Entry uploads = new Entry(60, Duration.ofMinutes(10));
	private final Entry profile = new Entry(120, Duration.ofMinutes(1));

	public Entry getLoginAccount() {
		return loginAccount;
	}

	public Entry getLoginIp() {
		return loginIp;
	}

	public Entry getAnonymousAuth() {
		return anonymousAuth;
	}

	public Entry getUploads() {
		return uploads;
	}

	public Entry getProfile() {
		return profile;
	}
}

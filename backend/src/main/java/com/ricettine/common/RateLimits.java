package com.ricettine.common;

import com.ricettine.config.LimitsConfig;
import java.time.Clock;
import java.time.Duration;
import java.util.Optional;
import java.util.UUID;
import java.util.function.Supplier;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;

/**
 * The named abuse limits. Every method that rejects throws 429 {@code too_many_attempts} with {@code Retry-After}.
 * Checks happen before any password hash or image decode.
 */
@Component
public class RateLimits {

	/** Bound on tracked keys per limiter, so key churn cannot exhaust memory. */
	static final int MAX_KEYS = 50_000;

	/** Longest limiter key kept; longer ones (a huge login email) are cut so they cannot become huge map keys. */
	static final int MAX_KEY_LENGTH = 320;

	private final RateLimiter loginAccount;
	private final RateLimiter loginIp;
	private final RateLimiter anonymousAuth;
	private final RateLimiter uploads;
	private final RateLimiter profile;

	public RateLimits(LimitsConfig cfg, Clock clock) {
		this.loginAccount = build(cfg.getLoginAccount(), clock);
		this.loginIp = build(cfg.getLoginIp(), clock);
		this.anonymousAuth = build(cfg.getAnonymousAuth(), clock);
		this.uploads = build(cfg.getUploads(), clock);
		this.profile = build(cfg.getProfile(), clock);
	}

	private static RateLimiter build(LimitsConfig.Entry e, Clock clock) {
		return new RateLimiter(e.getLimit(), e.getWindow(), MAX_KEYS, clock);
	}

	/**
	 * Reserves one login attempt on both the account (normalized email, known or not) and the IP limiter before any
	 * hash, so parallel requests cannot all pass the check. Rejects with 429 when either is at its limit. The
	 * reservation is the failure count: keep it on bad credentials ({@link LoginAttempt#failed}), give it back
	 * otherwise.
	 */
	public LoginAttempt reserveLogin(String ip, String email) {
		String accountKey = bound(email);
		String ipKey = bound(ipKey(ip));
		Optional<Duration> a = loginAccount.tryHit(accountKey);
		Optional<Duration> i = loginIp.tryHit(ipKey);
		if (a.isPresent() || i.isPresent()) {
			if (a.isEmpty()) {
				loginAccount.refund(accountKey);
			}
			if (i.isEmpty()) {
				loginIp.refund(ipKey);
			}
			throw tooMany(a.orElse(Duration.ZERO).compareTo(i.orElse(Duration.ZERO)) >= 0 ? a.get() : i.get());
		}
		return new LoginAttempt(accountKey, ipKey);
	}

	public final class LoginAttempt {

		private final String accountKey;
		private final String ipKey;

		private LoginAttempt(String accountKey, String ipKey) {
			this.accountKey = accountKey;
			this.ipKey = ipKey;
		}

		/** Correct password: the account counter resets and the IP is not charged. */
		public void succeeded() {
			loginAccount.clear(accountKey);
			loginIp.refund(ipKey);
		}

		/** Wrong password: both reservations stay as the failure count. */
		public void failed() {
		}

		/** The check did not complete (e.g. 503 busy): both reservations are given back. */
		public void abandoned() {
			loginAccount.refund(accountKey);
			loginIp.refund(ipKey);
		}

		/** Runs a password check: bad credentials keep the reservation, success clears it, anything else refunds. */
		public void run(Runnable passwordCheck) {
			run(() -> {
				passwordCheck.run();
				return null;
			});
		}

		/** {@link #run(Runnable)} for a check that returns what it authenticated. */
		public <T> T run(Supplier<T> passwordCheck) {
			T result;
			try {
				result = passwordCheck.get();
			}
			catch (ApiException e) {
				if ("bad_credentials".equals(e.getCode())) {
					failed();
				}
				else {
					abandoned();
				}
				throw e;
			}
			catch (RuntimeException e) {
				abandoned();
				throw e;
			}
			succeeded();
			return result;
		}
	}

	public void anonymousAuth(String ip) {
		hitOrReject(anonymousAuth, bound(ipKey(ip)));
	}

	public void upload(UUID userId) {
		hitOrReject(uploads, userId.toString());
	}

	public void profile(UUID userId) {
		hitOrReject(profile, userId.toString());
	}

	/** IPv6 clients are keyed by their /64 (one subscriber holds a whole /64); IPv4 and unparsable values as is. */
	static String ipKey(String ip) {
		if (ip == null || ip.indexOf(':') < 0 || !ip.matches("[0-9a-fA-F:.]+")) {
			return ip;
		}
		try {
			byte[] b = java.net.InetAddress.getByName(ip).getAddress();
			if (b.length != 16) {
				return ip;
			}
			return java.util.HexFormat.of().formatHex(b, 0, 8) + "::/64";
		}
		catch (java.net.UnknownHostException e) {
			return ip;
		}
	}

	private static String bound(String key) {
		return key.length() > MAX_KEY_LENGTH ? key.substring(0, MAX_KEY_LENGTH) : key;
	}

	private static void hitOrReject(RateLimiter limiter, String key) {
		limiter.tryHit(key).ifPresent(d -> {
			throw tooMany(d);
		});
	}

	private static ApiException tooMany(Duration retryAfter) {
		return new ApiException(HttpStatus.TOO_MANY_REQUESTS, "too_many_attempts").retryAfter(retryAfter);
	}
}

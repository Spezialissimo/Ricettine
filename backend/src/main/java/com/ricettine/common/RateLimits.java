package com.ricettine.common;

import com.ricettine.config.LimitsConfig;
import java.time.Clock;
import java.time.Duration;
import java.util.Optional;
import java.util.UUID;
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

	/** Rejects when either the account (normalized email, known or not) or the IP is at its failure limit. */
	public void checkLogin(String ip, String email) {
		Optional<Duration> a = loginAccount.check(email);
		Optional<Duration> i = loginIp.check(ip);
		if (a.isPresent() || i.isPresent()) {
			throw tooMany(a.orElse(Duration.ZERO).compareTo(i.orElse(Duration.ZERO)) >= 0 ? a.get() : i.get());
		}
	}

	public void loginFailed(String ip, String email) {
		loginAccount.hit(email);
		loginIp.hit(ip);
	}

	public void loginSucceeded(String email) {
		loginAccount.clear(email);
	}

	public void anonymousAuth(String ip) {
		checkThenHit(anonymousAuth, ip);
	}

	public void upload(UUID userId) {
		checkThenHit(uploads, userId.toString());
	}

	public void profile(UUID userId) {
		checkThenHit(profile, userId.toString());
	}

	private static void checkThenHit(RateLimiter limiter, String key) {
		limiter.check(key).ifPresent(d -> {
			throw tooMany(d);
		});
		limiter.hit(key);
	}

	private static ApiException tooMany(Duration retryAfter) {
		return new ApiException(HttpStatus.TOO_MANY_REQUESTS, "too_many_attempts").retryAfter(retryAfter);
	}
}

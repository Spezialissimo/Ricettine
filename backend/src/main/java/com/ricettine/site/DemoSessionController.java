package com.ricettine.site;

import com.ricettine.account.User;
import com.ricettine.account.UserRepository;
import com.ricettine.auth.AuthSessions;
import com.ricettine.common.ApiException;
import com.ricettine.common.RateLimits;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.time.Duration;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

/** Anonymous auto sign-in of the demo site as the guest {@code ospite}. */
@RestController
public class DemoSessionController {

	static final String GUEST_USERNAME = "ospite";
	static final Duration SESSION_TTL = Duration.ofDays(1);

	private final UserRepository users;
	private final AuthSessions sessions;
	private final RateLimits limits;

	public DemoSessionController(UserRepository users, AuthSessions sessions, RateLimits limits) {
		this.users = users;
		this.sessions = sessions;
		this.limits = limits;
	}

	@PostMapping("/api/demo/session")
	@ResponseStatus(HttpStatus.NO_CONTENT)
	public void create(HttpServletRequest req, HttpServletResponse res) {
		if (SiteContext.current() != Site.DEMO) {
			throw new ApiException(HttpStatus.NOT_FOUND, "not_found");
		}
		limits.demoSession(req.getRemoteAddr());
		User guest = users.findByUsername(GUEST_USERNAME)
			.orElseThrow(() -> new ApiException(HttpStatus.SERVICE_UNAVAILABLE, "demo_unavailable"));
		sessions.login(guest, req, res);
		req.getSession().setMaxInactiveInterval((int) SESSION_TTL.toSeconds());
	}
}

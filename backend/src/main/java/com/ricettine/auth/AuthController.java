package com.ricettine.auth;

import com.ricettine.account.AccountDtos.MeDto;
import com.ricettine.account.MeMapper;
import com.ricettine.account.Identity;
import com.ricettine.account.User;
import com.ricettine.account.UserRepository;
import com.ricettine.common.ApiException;
import com.ricettine.common.RateLimits;
import jakarta.annotation.PostConstruct;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotNull;
import org.springframework.http.HttpStatus;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;

@RestController
public class AuthController {

	public record LoginRequest(@NotNull String email, @NotNull String password) {
	}

	private final UserRepository users;
	private final PasswordEncoder encoder;
	private final AuthSessions sessions;
	private final CurrentUser currentUser;
	private final MeMapper me;
	private final RateLimits limits;
	private String dummyHash;

	public AuthController(UserRepository users, PasswordEncoder encoder, AuthSessions sessions,
			CurrentUser currentUser, MeMapper me, RateLimits limits) {
		this.me = me;
		this.limits = limits;
		this.users = users;
		this.encoder = encoder;
		this.sessions = sessions;
		this.currentUser = currentUser;
	}

	@PostConstruct
	void init() {
		// Unknown emails are checked against this hash so response time does not reveal account existence.
		dummyHash = encoder.encode("dummy-password-for-timing");
	}

	@PostMapping("/api/auth/login")
	public MeDto login(@Valid @RequestBody LoginRequest body, HttpServletRequest req, HttpServletResponse res) {
		String email = Identity.normalizeEmail(body.email());
		String ip = req.getRemoteAddr();
		// Reserved before hashing (counts unknown emails too so existence is not revealed); parallel requests cannot
		// all pass a read-only check.
		User user = limits.reserveLogin(ip, email).run(() -> {
			User found = users.findByEmail(email).orElse(null);
			boolean ok = encoder.matches(body.password(), found != null ? found.getPasswordHash() : dummyHash);
			if (found == null || !ok) {
				throw new ApiException(HttpStatus.UNAUTHORIZED, "bad_credentials");
			}
			return found;
		});
		sessions.login(user, req, res);
		return me.toDto(user);
	}

	@GetMapping("/api/me")
	public MeDto me() {
		return me.toDto(currentUser.require());
	}
}

package com.ricettine.invite;

import com.ricettine.account.AccountDtos.MeDto;
import com.ricettine.account.MeMapper;
import com.ricettine.account.AccountDtos.NewAccountRequest;
import com.ricettine.auth.AuthSessions;
import com.ricettine.common.RateLimits;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import jakarta.validation.Valid;
import java.time.Instant;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

@RestController
public class PublicInviteController {

	public record InviteInfo(Instant expiresAt) {
	}

	private final InviteService invites;
	private final AuthSessions sessions;
	private final MeMapper me;
	private final RateLimits limits;

	public PublicInviteController(InviteService invites, AuthSessions sessions, MeMapper me, RateLimits limits) {
		this.limits = limits;
		this.me = me;
		this.invites = invites;
		this.sessions = sessions;
	}

	@GetMapping("/api/invites/{token}")
	public InviteInfo info(@PathVariable String token) {
		return new InviteInfo(invites.peek(token));
	}

	@PostMapping("/api/invites/{token}/register")
	@ResponseStatus(HttpStatus.CREATED)
	public MeDto register(@PathVariable String token, @Valid @RequestBody NewAccountRequest body,
			HttpServletRequest req, HttpServletResponse res) {
		limits.anonymousAuth(req.getRemoteAddr());
		var user = invites.register(token, body);
		sessions.login(user, req, res);
		return me.toDto(user);
	}
}

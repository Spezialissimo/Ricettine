package com.ricettine.setup;

import com.ricettine.account.AccountDtos.MeDto;
import com.ricettine.account.MeMapper;
import com.ricettine.account.AccountDtos.NewAccountRequest;
import com.ricettine.auth.AuthSessions;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import jakarta.validation.Valid;
import java.util.Map;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

@RestController
public class SetupController {

	private final SetupService setup;
	private final AuthSessions authSessions;
	private final MeMapper me;

	public SetupController(SetupService setup, AuthSessions authSessions, MeMapper me) {
		this.me = me;
		this.setup = setup;
		this.authSessions = authSessions;
	}

	@GetMapping("/api/setup/status")
	public Map<String, Boolean> status() {
		return Map.of("setupRequired", setup.setupRequired());
	}

	@PostMapping("/api/setup/admin")
	@ResponseStatus(HttpStatus.CREATED)
	public MeDto createAdmin(@Valid @RequestBody NewAccountRequest req, HttpServletRequest request,
			HttpServletResponse response) {
		var admin = setup.createAdmin(req);
		authSessions.login(admin, request, response);
		return me.toDto(admin);
	}
}

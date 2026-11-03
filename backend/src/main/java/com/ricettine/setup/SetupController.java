package com.ricettine.setup;

import com.ricettine.account.AccountDtos.MeDto;
import com.ricettine.account.AccountDtos.NewAccountRequest;
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

	public SetupController(SetupService setup) {
		this.setup = setup;
	}

	@GetMapping("/api/setup/status")
	public Map<String, Boolean> status() {
		return Map.of("setupRequired", setup.setupRequired());
	}

	@PostMapping("/api/setup/admin")
	@ResponseStatus(HttpStatus.CREATED)
	public MeDto createAdmin(@Valid @RequestBody NewAccountRequest req) {
		return MeDto.of(setup.createAdmin(req));
	}
}

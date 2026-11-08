package com.ricettine.profile;

import com.ricettine.auth.CurrentUser;
import com.ricettine.common.RateLimits;
import com.ricettine.profile.ProfileDtos.ProfileDto;
import java.util.UUID;
import org.springframework.http.CacheControl;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/users")
public class ProfileController {

	private final ProfileService profiles;
	private final CurrentUser currentUser;
	private final RateLimits limits;

	ProfileController(ProfileService profiles, CurrentUser currentUser, RateLimits limits) {
		this.limits = limits;
		this.profiles = profiles;
		this.currentUser = currentUser;
	}

	@GetMapping("/{username}/profile")
	ResponseEntity<ProfileDto> profile(@PathVariable String username) {
		UUID me = currentUser.id();
		limits.profile(me);
		return ResponseEntity.ok().cacheControl(CacheControl.noStore())
			.body(profiles.profile(username, me));
	}
}

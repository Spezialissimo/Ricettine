package com.ricettine.media;

import jakarta.servlet.http.HttpServletRequest;
import java.util.Optional;
import org.springframework.stereotype.Component;

@Component
public class AvatarAccessPolicy implements MediaAccessPolicy {

	@Override
	public MediaKind kind() {
		return MediaKind.AVATAR;
	}

	@Override
	public Optional<String> cacheControl(Media m, HttpServletRequest req) {
		return Optional.of("public, max-age=31536000, immutable");
	}
}

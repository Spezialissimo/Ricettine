package com.ricettine.media;

import com.ricettine.common.ApiException;
import jakarta.servlet.http.HttpServletRequest;
import java.util.EnumMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RestController;

@RestController
public class MediaController {

	private final MediaService media;
	private final MediaRepository repo;
	private final Map<MediaKind, MediaAccessPolicy> policies;

	public MediaController(MediaService media, MediaRepository repo, List<MediaAccessPolicy> policies) {
		this.media = media;
		this.repo = repo;
		this.policies = policiesByKind(policies);
	}

	/** One policy per kind; a duplicate is a configuration error that stops startup. */
	static Map<MediaKind, MediaAccessPolicy> policiesByKind(List<MediaAccessPolicy> all) {
		Map<MediaKind, MediaAccessPolicy> map = new EnumMap<>(MediaKind.class);
		for (MediaAccessPolicy p : all) {
			MediaAccessPolicy previous = map.put(p.kind(), p);
			if (previous != null) {
				throw new IllegalStateException("Two media access policies for kind " + p.kind() + ": "
						+ previous.getClass().getName() + " and " + p.getClass().getName());
			}
		}
		return map;
	}

	@GetMapping("/media/{mediaId}/{variant}.jpg")
	ResponseEntity<byte[]> get(@PathVariable String mediaId, @PathVariable String variant,
			HttpServletRequest request) {
		ImageVariant v;
		try {
			v = ImageVariant.valueOf(variant.toUpperCase(Locale.ROOT));
		}
		catch (IllegalArgumentException e) {
			throw new ApiException(HttpStatus.NOT_FOUND, "not_found");
		}
		if (!mediaId.matches("[A-Za-z0-9_-]{1,64}")) {
			throw new ApiException(HttpStatus.NOT_FOUND, "not_found");
		}
		Media row = repo.findById(mediaId).orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "not_found"));
		MediaAccessPolicy policy = policies.get(row.getKind());
		String cache = policy == null ? null : policy.cacheControl(row, request).orElse(null);
		if (cache == null) {
			throw new ApiException(HttpStatus.NOT_FOUND, "not_found");
		}
		byte[] data = media.load(mediaId, v).orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "not_found"));
		return ResponseEntity.ok().contentType(MediaType.IMAGE_JPEG)
				.header("Cache-Control", cache)
				.body(data);
	}
}

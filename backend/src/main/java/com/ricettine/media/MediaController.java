package com.ricettine.media;

import com.ricettine.common.ApiException;
import java.util.Locale;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RestController;

@RestController
public class MediaController {

	private final MediaService media;

	public MediaController(MediaService media) {
		this.media = media;
	}

	@GetMapping("/media/{mediaId}/{variant}.jpg")
	ResponseEntity<byte[]> get(@PathVariable String mediaId, @PathVariable String variant) {
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
		byte[] data = media.load(mediaId, v).orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "not_found"));
		return ResponseEntity.ok().contentType(MediaType.IMAGE_JPEG)
				.header("Cache-Control", "public, max-age=31536000, immutable")
				.body(data);
	}
}

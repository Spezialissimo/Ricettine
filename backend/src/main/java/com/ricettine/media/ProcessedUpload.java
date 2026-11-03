package com.ricettine.media;

import java.util.Map;

/** Encoded variants of one upload, ready for {@link MediaService#register}; holds no DB or storage state. */
public record ProcessedUpload(Map<ImageVariant, byte[]> variants) {

	public ProcessedUpload {
		variants = Map.copyOf(variants);
	}
}

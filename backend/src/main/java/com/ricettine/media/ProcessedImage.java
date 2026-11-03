package com.ricettine.media;

import java.util.Map;

/** Result of processing, with what was actually decoded (for tests and diagnostics). */
record ProcessedImage(Map<ImageVariant, byte[]> variants, int decodedWidth, int decodedHeight, int subsample) {
}

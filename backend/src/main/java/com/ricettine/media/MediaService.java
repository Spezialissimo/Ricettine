package com.ricettine.media;

import com.ricettine.common.Tokens;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Set;
import org.springframework.stereotype.Service;

@Service
public class MediaService {

	private final BlobStore blobs;
	private final ImageProcessor processor;
	private final ProcessingLimiter limiter;

	public MediaService(BlobStore blobs, ImageProcessor processor, ProcessingLimiter limiter) {
		this.blobs = blobs;
		this.processor = processor;
		this.limiter = limiter;
	}

	static String key(String mediaId, ImageVariant v) {
		return "img/" + mediaId + "/" + v.fileName();
	}

	/** Processes first (nothing is written on invalid input); rolls back written variants on a later failure. */
	public String store(byte[] input, Set<ImageVariant> variants) {
		Map<ImageVariant, byte[]> processed = limiter.run(() -> processor.process(input, variants));
		String id = Tokens.newToken();
		List<String> written = new ArrayList<>();
		try {
			for (var e : processed.entrySet()) {
				String k = key(id, e.getKey());
				blobs.put(k, e.getValue(), "image/jpeg");
				written.add(k);
			}
		}
		catch (RuntimeException ex) {
			for (String k : written) {
				try {
					blobs.delete(k);
				}
				catch (RuntimeException suppressed) {
					ex.addSuppressed(suppressed);
				}
			}
			throw ex;
		}
		return id;
	}

	public void delete(String mediaId) {
		for (ImageVariant v : ImageVariant.values()) {
			blobs.delete(key(mediaId, v));
		}
	}

	public String url(String mediaId, ImageVariant v) {
		return "/media/" + mediaId + "/" + v.fileName();
	}

	java.util.Optional<byte[]> load(String mediaId, ImageVariant v) {
		return blobs.get(key(mediaId, v));
	}
}

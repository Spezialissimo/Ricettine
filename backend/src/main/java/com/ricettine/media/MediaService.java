package com.ricettine.media;

import com.ricettine.common.AfterTransaction;
import com.ricettine.common.Tokens;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class MediaService {

	private final BlobStore blobs;
	private final ImageProcessor processor;
	private final ProcessingLimiter limiter;

	private final MediaRepository repo;
	private final AfterTransaction after;

	public MediaService(BlobStore blobs, ImageProcessor processor, ProcessingLimiter limiter, MediaRepository repo,
			AfterTransaction after) {
		this.repo = repo;
		this.after = after;
		this.blobs = blobs;
		this.processor = processor;
		this.limiter = limiter;
	}

	static String key(String mediaId, ImageVariant v) {
		return "img/" + mediaId + "/" + v.fileName();
	}

	/**
	 * Processes first (nothing is written on invalid input), writes the blobs, then the registry row. Written blobs
	 * are removed if a write fails, or if the surrounding transaction (if any) later rolls back.
	 */
	public String store(byte[] input, Set<ImageVariant> variants, UUID ownerId, MediaKind kind, UUID recipeId) {
		Map<ImageVariant, byte[]> processed = limiter.run(() -> processor.process(input, variants));
		String id = Tokens.newToken();
		List<String> written = new ArrayList<>();
		try {
			for (var e : processed.entrySet()) {
				String k = key(id, e.getKey());
				blobs.put(k, e.getValue(), "image/jpeg");
				written.add(k);
			}
			repo.saveAndFlush(new Media(id, ownerId, kind, recipeId));
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
		after.afterRollback("delete orphaned media " + id, () -> deleteBlobs(id));
		return id;
	}

	/** Deletes the row now (inside the caller's transaction, if any) and the blobs once it has committed. */
	@Transactional
	public void delete(String mediaId) {
		repo.deleteRow(mediaId);
		after.afterCommit("delete media blobs " + mediaId, () -> deleteBlobs(mediaId));
	}

	private void deleteBlobs(String mediaId) {
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

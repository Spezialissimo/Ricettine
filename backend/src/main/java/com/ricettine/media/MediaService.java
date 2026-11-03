package com.ricettine.media;

import com.ricettine.common.AfterTransaction;
import com.ricettine.common.Tokens;
import java.util.ArrayList;
import java.util.List;
import java.util.Set;
import java.util.UUID;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionSynchronizationManager;

@Service
public class MediaService {

	private static final org.slf4j.Logger log = org.slf4j.LoggerFactory.getLogger(MediaService.class);

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
	 * Decodes, resizes and re-encodes {@code input} under the {@link ProcessingLimiter} (which may wait up to its
	 * configured timeout). Touches neither the database nor storage, and must be called outside any transaction so
	 * a queued or slow upload never holds a pooled connection: call it first, then {@link #register} inside a short
	 * transaction. Throws {@link IllegalStateException} when a transaction is active.
	 */
	public ProcessedUpload process(byte[] input, Set<ImageVariant> variants) {
		if (TransactionSynchronizationManager.isActualTransactionActive()) {
			throw new IllegalStateException(
					"MediaService.process must not run inside a transaction: process first, then register");
		}
		return new ProcessedUpload(limiter.run(() -> processor.process(input, variants)));
	}

	/**
	 * Writes the blobs, then the registry row, and returns the new media id. Written blobs are removed if a write
	 * fails, or if the surrounding transaction (if any) later rolls back.
	 */
	public String register(ProcessedUpload upload, UUID ownerId, MediaKind kind, UUID recipeIdOrNull) {
		String id = Tokens.newToken();
		List<String> written = new ArrayList<>();
		try {
			for (var e : upload.variants().entrySet()) {
				String k = key(id, e.getKey());
				blobs.put(k, e.getValue(), "image/jpeg");
				written.add(k);
			}
			repo.saveAndFlush(new Media(id, ownerId, kind, recipeIdOrNull));
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

	/**
	 * Deletes every media row the user owns, of any kind, now (inside the caller's transaction) and all their blobs
	 * once it has committed. Account deletion calls this centrally, so no feature has to clean up its own media.
	 */
	@Transactional
	public void deleteAllOwnedBy(UUID ownerId) {
		List<String> ids = repo.idsOwnedBy(ownerId);
		if (ids.isEmpty()) {
			return;
		}
		repo.deleteOwnedBy(ownerId);
		after.afterCommit("delete media blobs of " + ownerId, () -> ids.forEach(this::deleteBlobsBestEffort));
	}

	/** One media's failure must not stop the others from being cleaned up. */
	private void deleteBlobsBestEffort(String mediaId) {
		try {
			deleteBlobs(mediaId);
		}
		catch (RuntimeException e) {
			log.warn("Failed to delete blobs of media {}", mediaId, e);
		}
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

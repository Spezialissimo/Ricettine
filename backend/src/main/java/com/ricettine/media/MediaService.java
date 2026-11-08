package com.ricettine.media;

import com.ricettine.common.AfterTransaction;
import com.ricettine.common.Tokens;
import java.io.IOException;
import java.io.UncheckedIOException;
import java.util.ArrayList;
import java.util.Collection;
import java.util.List;
import java.util.Set;
import java.util.UUID;
import java.util.function.Function;
import java.util.function.Supplier;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionSynchronizationManager;
import org.springframework.web.multipart.MultipartFile;

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

	/** The upload's bytes, read only when the supplier is called (i.e. once a processing permit is held). */
	public static Supplier<byte[]> bytesOf(MultipartFile file) {
		return () -> {
			try {
				return file.getBytes();
			}
			catch (IOException e) {
				throw new UncheckedIOException(e);
			}
		};
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
		return process(() -> input, variants);
	}

	/**
	 * Like {@link #process(byte[], Set)} but the input bytes are only read (by {@code input}) once a processing
	 * permit is held, so queued uploads do not each keep a full copy of their image on the heap while waiting.
	 */
	public ProcessedUpload process(Supplier<byte[]> input, Set<ImageVariant> variants) {
		if (TransactionSynchronizationManager.isActualTransactionActive()) {
			throw new IllegalStateException(
					"MediaService.process must not run inside a transaction: process first, then register");
		}
		return new ProcessedUpload(limiter.run(() -> processor.process(input.get(), variants)));
	}

	/**
	 * Writes the blobs, then the registry row, and returns the new media id. Written blobs are removed if a write
	 * fails, or if the surrounding transaction (if any) later rolls back.
	 */
	public String register(ProcessedUpload upload, UUID ownerId, MediaKind kind, UUID recipeIdOrNull) {
		return register(upload, ownerId, kind, recipeIdOrNull, null);
	}

	/** {@link #register(ProcessedUpload, UUID, MediaKind, UUID)} for a media that belongs to a cookbook (its cover). */
	public String register(ProcessedUpload upload, UUID ownerId, MediaKind kind, UUID recipeIdOrNull,
			UUID cookbookIdOrNull) {
		String id = Tokens.newToken();
		List<String> written = new ArrayList<>();
		try {
			writeBlobs(id, upload, written);
			repo.saveAndFlush(new Media(id, ownerId, kind, recipeIdOrNull, cookbookIdOrNull));
		}
		catch (RuntimeException ex) {
			removeBlobs(written, ex);
			throw ex;
		}
		after.afterRollback("delete orphaned media " + id, () -> deleteBlobs(id));
		return id;
	}

	/**
	 * Writes the blobs under a fresh media id with no transaction (and so no pooled connection or row lock) held,
	 * then runs {@code registerRow}, which is expected to open a short transaction that locks the owning row,
	 * re-checks access and limits, and inserts the row via {@link #registerStored}. If either step fails the blobs
	 * are removed, so a failed write or a lost race leaves neither a row nor an orphaned blob. Throws
	 * {@link IllegalStateException} when a transaction is active.
	 */
	public <T> T storeThen(ProcessedUpload upload, Function<String, T> registerRow) {
		if (TransactionSynchronizationManager.isActualTransactionActive()) {
			throw new IllegalStateException("MediaService.storeThen must not run inside a transaction");
		}
		String id = Tokens.newToken();
		List<String> written = new ArrayList<>();
		try {
			writeBlobs(id, upload, written);
			return registerRow.apply(id);
		}
		catch (RuntimeException ex) {
			removeBlobs(written, ex);
			throw ex;
		}
	}

	/** Inserts the registry row for blobs already written by {@link #storeThen}; call inside its transaction. */
	public void registerStored(String id, UUID ownerId, MediaKind kind, UUID recipeIdOrNull, UUID cookbookIdOrNull) {
		repo.saveAndFlush(new Media(id, ownerId, kind, recipeIdOrNull, cookbookIdOrNull));
	}

	private void writeBlobs(String id, ProcessedUpload upload, List<String> written) {
		for (var e : upload.variants().entrySet()) {
			String k = key(id, e.getKey());
			blobs.put(k, e.getValue(), "image/jpeg");
			written.add(k);
		}
	}

	/** Deletes {@code keys}, attaching any failure to {@code cause}. A put that threw may have left a partial blob. */
	private void removeBlobs(List<String> keys, RuntimeException cause) {
		for (String k : keys) {
			try {
				blobs.delete(k);
			}
			catch (RuntimeException suppressed) {
				cause.addSuppressed(suppressed);
			}
		}
	}

	/** Deletes the row now (inside the caller's transaction, if any) and the blobs once it has committed. */
	@Transactional
	public void delete(String mediaId) {
		repo.deleteRows(List.of(mediaId));
		after.afterCommit("delete media blobs " + mediaId, () -> deleteBlobs(mediaId));
	}

	/** {@link #delete} for several ids: one statement now, every id's blobs once it has committed. */
	@Transactional
	public void deleteAll(Collection<String> mediaIds) {
		if (mediaIds.isEmpty()) {
			return;
		}
		List<String> ids = List.copyOf(mediaIds);
		repo.deleteRows(ids);
		after.afterCommit("delete media blobs " + ids, () -> ids.forEach(this::deleteBlobsBestEffort));
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

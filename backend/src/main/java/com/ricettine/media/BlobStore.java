package com.ricettine.media;

import java.util.Optional;

/** Minimal blob storage. Keys look like {@code img/{token}/{variant}.jpg}. */
public interface BlobStore {

	void put(String key, byte[] data, String contentType);

	Optional<byte[]> get(String key);

	void delete(String key);

	/**
	 * Deletes every blob whose key starts with {@code prefix}. The prefix must end in {@code /} and name a
	 * sub-tree (never blank, never the root), so a bug cannot wipe the whole store.
	 */
	void deleteByPrefix(String prefix);

	/** Shared guard of the implementations. */
	static void requireSubtreePrefix(String prefix) {
		if (prefix == null || prefix.isBlank() || !prefix.endsWith("/") || prefix.startsWith("/")
				|| prefix.indexOf('\0') >= 0 || prefix.indexOf('\\') >= 0
				|| java.util.Arrays.asList(prefix.split("/")).contains("..")) {
			throw new IllegalArgumentException("Invalid blob prefix");
		}
	}
}

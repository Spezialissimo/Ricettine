package com.ricettine.media;

import java.util.Optional;

/** Minimal blob storage. Keys look like {@code img/{token}/{variant}.jpg}. */
public interface BlobStore {

	void put(String key, byte[] data, String contentType);

	Optional<byte[]> get(String key);

	void delete(String key);
}

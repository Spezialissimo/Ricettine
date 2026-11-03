package com.ricettine.media;

import java.io.IOException;
import java.io.UncheckedIOException;
import java.nio.file.Files;
import java.nio.file.NoSuchFileException;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.util.Optional;

public class LocalBlobStore implements BlobStore {

	private final Path root;

	public LocalBlobStore(Path root) {
		this.root = root.toAbsolutePath().normalize();
	}

	private Path resolve(String key) {
		if (key == null || key.isBlank() || key.indexOf('\0') >= 0 || key.indexOf('\\') >= 0 || key.startsWith("/")
				|| java.util.Arrays.asList(key.split("/")).contains("..")) {
			throw new IllegalArgumentException("Invalid blob key");
		}
		Path p = root.resolve(key).normalize();
		if (!p.startsWith(root) || p.equals(root)) {
			throw new IllegalArgumentException("Invalid blob key");
		}
		return p;
	}

	@Override
	public void put(String key, byte[] data, String contentType) {
		Path p = resolve(key);
		try {
			Files.createDirectories(p.getParent());
			Path tmp = Files.createTempFile(p.getParent(), ".upload-", ".tmp");
			try {
				Files.write(tmp, data);
				Files.move(tmp, p, StandardCopyOption.REPLACE_EXISTING, StandardCopyOption.ATOMIC_MOVE);
			}
			finally {
				Files.deleteIfExists(tmp);
			}
		}
		catch (IOException e) {
			throw new UncheckedIOException(e);
		}
	}

	@Override
	public Optional<byte[]> get(String key) {
		Path p = resolve(key);
		try {
			return Optional.of(Files.readAllBytes(p));
		}
		catch (NoSuchFileException e) {
			return Optional.empty();
		}
		catch (IOException e) {
			throw new UncheckedIOException(e);
		}
	}

	@Override
	public void delete(String key) {
		Path p = resolve(key);
		try {
			Files.deleteIfExists(p);
			Path parent = p.getParent();
			if (parent != null && !parent.equals(root)) {
				try {
					Files.deleteIfExists(parent); // only succeeds when empty
				}
				catch (java.nio.file.DirectoryNotEmptyException ignored) {
				}
			}
		}
		catch (IOException e) {
			throw new UncheckedIOException(e);
		}
	}
}

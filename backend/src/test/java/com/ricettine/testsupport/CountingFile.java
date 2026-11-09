package com.ricettine.testsupport;

import java.io.IOException;
import java.util.concurrent.atomic.AtomicInteger;
import org.springframework.mock.web.MockMultipartFile;

/** An upload that counts how often its bytes are materialised. */
public class CountingFile extends MockMultipartFile {

	private final AtomicInteger reads = new AtomicInteger();

	public CountingFile(byte[] bytes) {
		super("file", "p.jpg", "image/jpeg", bytes);
	}

	@Override
	public byte[] getBytes() throws IOException {
		reads.incrementAndGet();
		return super.getBytes();
	}

	public int reads() {
		return reads.get();
	}
}

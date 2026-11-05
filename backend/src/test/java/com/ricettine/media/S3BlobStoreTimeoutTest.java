package com.ricettine.media;

import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.junit.jupiter.api.Assertions.assertTimeoutPreemptively;

import java.net.ServerSocket;
import java.net.Socket;
import java.time.Duration;
import java.util.List;
import java.util.concurrent.CopyOnWriteArrayList;
import org.junit.jupiter.api.Test;

class S3BlobStoreTimeoutTest {

	@Test
	void putToSilentServerFailsFast() throws Exception {
		System.setProperty("aws.accessKeyId", "test");
		System.setProperty("aws.secretAccessKey", "test");
		List<Socket> held = new CopyOnWriteArrayList<>();
		try (ServerSocket server = new ServerSocket(0)) {
			Thread.ofVirtual().start(() -> {
				try {
					while (true) {
						held.add(server.accept()); // accepts, never answers
					}
				}
				catch (Exception ignored) {
					// server closed
				}
			});
			S3BlobStore store = S3BlobStore.create("b", "us-east-1", "http://127.0.0.1:" + server.getLocalPort(), true,
					new S3BlobStore.S3Timeouts(Duration.ofSeconds(1), Duration.ofMillis(500), Duration.ofMillis(500)));
			assertTimeoutPreemptively(Duration.ofSeconds(5),
					() -> assertThatThrownBy(() -> store.put("k", new byte[] {1}, "image/jpeg")).isNotNull());
		}
		finally {
			System.clearProperty("aws.accessKeyId");
			System.clearProperty("aws.secretAccessKey");
			for (Socket s : held) {
				s.close();
			}
		}
	}
}

package com.ricettine.media;

import static org.assertj.core.api.Assertions.assertThat;

import java.net.URI;
import java.time.Duration;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Test;
import org.testcontainers.containers.GenericContainer;
import org.testcontainers.containers.wait.strategy.Wait;
import software.amazon.awssdk.services.s3.S3Client;
import software.amazon.awssdk.services.s3.model.CreateBucketRequest;

class S3BlobStoreIT {

	// minio/minio is no longer pullable from Docker Hub (and quay.io requires auth), so a pinned
	// S3-compatible container is used instead; the store is exercised over real HTTP, path-style.
	static GenericContainer<?> s3 = new GenericContainer<>("adobe/s3mock:5.2.3").withExposedPorts(9090)
			.waitingFor(Wait.forHttp("/").forPort(9090).forStatusCodeMatching(c -> c < 500));

	static S3BlobStore store;

	@BeforeAll
	static void start() {
		s3.start();
		System.setProperty("aws.accessKeyId", "test");
		System.setProperty("aws.secretAccessKey", "test");
		String endpoint = "http://" + s3.getHost() + ":" + s3.getMappedPort(9090);
		store = S3BlobStore.create("test", "us-east-1", endpoint, true,
				new S3BlobStore.S3Timeouts(Duration.ofSeconds(30), Duration.ofSeconds(10), Duration.ofSeconds(5)));
		try (S3Client admin = S3Client.builder().region(software.amazon.awssdk.regions.Region.US_EAST_1)
				.endpointOverride(URI.create(endpoint)).forcePathStyle(true).build()) {
			admin.createBucket(CreateBucketRequest.builder().bucket("test").build());
		}
	}

	@AfterAll
	static void stop() {
		System.clearProperty("aws.accessKeyId");
		System.clearProperty("aws.secretAccessKey");
		s3.stop();
	}

	@Test
	void roundTrip() {
		store.put("img/abc/thumb.jpg", new byte[] {1, 2, 3}, "image/jpeg");
		assertThat(store.get("img/abc/thumb.jpg")).hasValue(new byte[] {1, 2, 3});
		store.delete("img/abc/thumb.jpg");
		assertThat(store.get("img/abc/thumb.jpg")).isEmpty();
	}

	@Test
	void missingKeyIsEmpty() {
		assertThat(store.get("img/none/x.jpg")).isEmpty();
	}
}

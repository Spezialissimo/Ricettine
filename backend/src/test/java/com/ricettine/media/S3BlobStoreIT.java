package com.ricettine.media;

import static org.assertj.core.api.Assertions.assertThat;

import java.net.URI;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Test;
import org.testcontainers.containers.GenericContainer;
import org.testcontainers.containers.wait.strategy.Wait;
import software.amazon.awssdk.auth.credentials.AwsBasicCredentials;
import software.amazon.awssdk.auth.credentials.StaticCredentialsProvider;
import software.amazon.awssdk.regions.Region;
import software.amazon.awssdk.services.s3.S3Client;
import software.amazon.awssdk.services.s3.S3Configuration;
import software.amazon.awssdk.services.s3.model.CreateBucketRequest;

class S3BlobStoreIT {

	// minio/minio is no longer pullable from Docker Hub (and quay.io requires auth), so an S3-compatible
	// container is used instead; the store is exercised over real HTTP with path-style addressing.
	static GenericContainer<?> minio = new GenericContainer<>("adobe/s3mock:latest").withExposedPorts(9090)
			.waitingFor(Wait.forHttp("/").forPort(9090).forStatusCodeMatching(c -> c < 500));

	static S3Client client;

	@BeforeAll
	static void start() {
		minio.start();
		client = S3Client.builder().region(Region.US_EAST_1)
				.endpointOverride(URI.create("http://" + minio.getHost() + ":" + minio.getMappedPort(9090)))
				.credentialsProvider(StaticCredentialsProvider.create(AwsBasicCredentials.create("test", "test")))
				.serviceConfiguration(S3Configuration.builder().pathStyleAccessEnabled(true).build()).build();
		client.createBucket(CreateBucketRequest.builder().bucket("test").build());
	}

	@AfterAll
	static void stop() {
		client.close();
		minio.stop();
	}

	@Test
	void roundTrip() {
		S3BlobStore s = new S3BlobStore(client, "test");
		s.put("img/abc/thumb.jpg", new byte[] {1, 2, 3}, "image/jpeg");
		assertThat(s.get("img/abc/thumb.jpg")).hasValue(new byte[] {1, 2, 3});
		s.delete("img/abc/thumb.jpg");
		assertThat(s.get("img/abc/thumb.jpg")).isEmpty();
	}

	@Test
	void missingKeyIsEmpty() {
		assertThat(new S3BlobStore(client, "test").get("img/none/x.jpg")).isEmpty();
	}
}

package com.ricettine.media;

import java.net.URI;
import java.time.Duration;
import java.util.Optional;
import software.amazon.awssdk.core.client.config.ClientOverrideConfiguration;
import software.amazon.awssdk.core.sync.RequestBody;
import software.amazon.awssdk.http.apache5.Apache5HttpClient;
import software.amazon.awssdk.regions.Region;
import software.amazon.awssdk.services.s3.S3Client;
import software.amazon.awssdk.services.s3.S3ClientBuilder;
import software.amazon.awssdk.services.s3.model.DeleteObjectRequest;
import software.amazon.awssdk.services.s3.model.GetObjectRequest;
import software.amazon.awssdk.services.s3.model.NoSuchKeyException;
import software.amazon.awssdk.services.s3.model.PutObjectRequest;

public class S3BlobStore implements BlobStore {

	private final S3Client client;
	private final String bucket;

	public S3BlobStore(S3Client client, String bucket) {
		this.client = client;
		this.bucket = bucket;
	}

	/** Whole-call, per-attempt and connect timeouts; SDK retries stay at their default. */
	public record S3Timeouts(Duration apiCall, Duration attempt, Duration connect) {
	}

	/** Builds a store with the default AWS credential chain; blank region/endpoint fall back to SDK defaults. */
	public static S3BlobStore create(String bucket, String region, String endpoint, boolean pathStyle,
			S3Timeouts timeouts) {
		S3ClientBuilder b = S3Client.builder().forcePathStyle(pathStyle)
			.overrideConfiguration(ClientOverrideConfiguration.builder().apiCallTimeout(timeouts.apiCall())
				.apiCallAttemptTimeout(timeouts.attempt()).build())
			.httpClientBuilder(Apache5HttpClient.builder().connectionTimeout(timeouts.connect()));
		if (region != null && !region.isBlank()) {
			b.region(Region.of(region));
		}
		if (endpoint != null && !endpoint.isBlank()) {
			b.endpointOverride(URI.create(endpoint));
		}
		return new S3BlobStore(b.build(), bucket);
	}

	@Override
	public void put(String key, byte[] data, String contentType) {
		client.putObject(PutObjectRequest.builder().bucket(bucket).key(key).contentType(contentType).build(),
				RequestBody.fromBytes(data));
	}

	@Override
	public Optional<byte[]> get(String key) {
		try {
			return Optional.of(client.getObjectAsBytes(GetObjectRequest.builder().bucket(bucket).key(key).build())
					.asByteArray());
		}
		catch (NoSuchKeyException e) {
			return Optional.empty();
		}
	}

	@Override
	public void delete(String key) {
		client.deleteObject(DeleteObjectRequest.builder().bucket(bucket).key(key).build());
	}
}

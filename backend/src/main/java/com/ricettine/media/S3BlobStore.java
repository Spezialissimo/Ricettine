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
import software.amazon.awssdk.services.s3.model.Delete;
import software.amazon.awssdk.services.s3.model.DeleteObjectsRequest;
import software.amazon.awssdk.services.s3.model.DeleteObjectsResponse;
import software.amazon.awssdk.services.s3.model.GetObjectRequest;
import software.amazon.awssdk.services.s3.model.ListObjectsV2Request;
import software.amazon.awssdk.services.s3.model.ObjectIdentifier;
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

	/** Lists the prefix page by page (at most 1000 keys each) and deletes each page with one DeleteObjects call. */
	@Override
	public void deleteByPrefix(String prefix) {
		BlobStore.requireSubtreePrefix(prefix);
		client.listObjectsV2Paginator(ListObjectsV2Request.builder().bucket(bucket).prefix(prefix).build())
			.forEach(page -> {
				if (page.contents().isEmpty()) {
					return;
				}
				DeleteObjectsResponse response = client.deleteObjects(DeleteObjectsRequest.builder().bucket(bucket)
					.delete(Delete.builder()
						.objects(page.contents().stream().map(o -> ObjectIdentifier.builder().key(o.key()).build())
							.toList())
						.quiet(true).build())
					.build());
				if (response.hasErrors() && !response.errors().isEmpty()) {
					throw new IllegalStateException("Could not delete blobs under " + prefix + ": "
							+ response.errors().get(0).message());
				}
			});
	}
}

package com.ricettine.media;

import java.util.Optional;
import software.amazon.awssdk.core.sync.RequestBody;
import software.amazon.awssdk.services.s3.S3Client;
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

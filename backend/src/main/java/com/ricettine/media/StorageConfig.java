package com.ricettine.media;

import java.net.URI;
import java.nio.file.Path;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.util.StringUtils;
import software.amazon.awssdk.regions.Region;
import software.amazon.awssdk.services.s3.S3Client;
import software.amazon.awssdk.services.s3.S3ClientBuilder;

@Configuration
public class StorageConfig {

	@Bean
	@ConditionalOnProperty(name = "ricettine.storage.type", havingValue = "local", matchIfMissing = true)
	BlobStore localBlobStore(@Value("${ricettine.storage.local.path:./data/media}") String path) {
		return new LocalBlobStore(Path.of(path));
	}

	@Bean
	@ConditionalOnProperty(name = "ricettine.storage.type", havingValue = "s3")
	BlobStore s3BlobStore(@Value("${ricettine.storage.s3.bucket}") String bucket,
			@Value("${ricettine.storage.s3.region:}") String region,
			@Value("${ricettine.storage.s3.endpoint:}") String endpoint,
			@Value("${ricettine.storage.s3.path-style:false}") boolean pathStyle) {
		S3ClientBuilder b = S3Client.builder().forcePathStyle(pathStyle);
		if (StringUtils.hasText(region)) {
			b.region(Region.of(region));
		}
		if (StringUtils.hasText(endpoint)) {
			b.endpointOverride(URI.create(endpoint));
		}
		return new S3BlobStore(b.build(), bucket);
	}
}

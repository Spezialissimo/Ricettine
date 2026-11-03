package com.ricettine.media;

import java.nio.file.Path;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

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
		return S3BlobStore.create(bucket, region, endpoint, pathStyle);
	}
}

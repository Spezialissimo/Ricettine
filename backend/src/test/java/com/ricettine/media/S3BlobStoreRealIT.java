package com.ricettine.media;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.Duration;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;

/** Runs only against real AWS (default credential chain): set RICETTINE_S3_IT_BUCKET, and optionally AWS_REGION. */
@EnabledIfEnvironmentVariable(named = "RICETTINE_S3_IT_BUCKET", matches = ".+")
class S3BlobStoreRealIT {

	@Test
	void roundTripAgainstRealS3() {
		String region = System.getenv().getOrDefault("AWS_REGION", "eu-west-1");
		S3BlobStore store = S3BlobStore.create(System.getenv("RICETTINE_S3_IT_BUCKET"), region, "", false,
				new S3BlobStore.S3Timeouts(Duration.ofSeconds(30), Duration.ofSeconds(10), Duration.ofSeconds(5)));
		String key = "it-check/" + UUID.randomUUID();
		try {
			store.put(key, new byte[] {1, 2, 3}, "application/octet-stream");
			assertThat(store.get(key)).hasValue(new byte[] {1, 2, 3});
		}
		finally {
			store.delete(key);
		}
		assertThat(store.get(key)).isEmpty();
		assertThat(store.get("it-check/missing-" + UUID.randomUUID())).isEmpty();
	}
}

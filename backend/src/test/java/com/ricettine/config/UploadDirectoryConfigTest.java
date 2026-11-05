package com.ricettine.config;

import static org.assertj.core.api.Assertions.assertThat;

import java.nio.file.Path;
import org.junit.jupiter.api.Test;

class UploadDirectoryConfigTest {

	@Test
	void absoluteLocationIsManaged() {
		assertThat(UploadDirectoryConfig.managedDirectory("/var/tmp/ricettine-uploads"))
			.contains(Path.of("/var/tmp/ricettine-uploads"));
	}

	@Test
	void relativeOrBlankLocationIsLeftToTomcat() {
		assertThat(UploadDirectoryConfig.managedDirectory("uploads/tmp")).isEmpty();
		assertThat(UploadDirectoryConfig.managedDirectory("")).isEmpty();
		assertThat(UploadDirectoryConfig.managedDirectory("  ")).isEmpty();
		assertThat(UploadDirectoryConfig.managedDirectory(null)).isEmpty();
	}
}

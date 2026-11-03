package com.ricettine.media;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.multipart;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.ricettine.IntegrationTest;
import com.ricettine.common.ApiException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Set;
import java.util.stream.Stream;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.web.multipart.MaxUploadSizeExceededException;

class MediaIT extends IntegrationTest {

	@Autowired
	MediaService media;

	@Autowired
	BlobStore blobs;

	@Value("${ricettine.storage.local.path}")
	String root;

	@Test
	void storedImageIsServedWithImmutableCache() throws Exception {
		String id = media.store(TestImages.orientation6(), Set.of(ImageVariant.THUMB, ImageVariant.DISPLAY));
		assertThat(media.url(id, ImageVariant.THUMB)).isEqualTo("/media/" + id + "/thumb.jpg");
		byte[] body = mvc.perform(get(media.url(id, ImageVariant.THUMB))).andExpect(status().isOk())
				.andExpect(content().contentType("image/jpeg"))
				.andExpect(header().string("Cache-Control", "public, max-age=31536000, immutable"))
				.andReturn().getResponse().getContentAsByteArray();
		assertThat(body[0]).isEqualTo((byte) 0xFF);
		assertThat(body[1]).isEqualTo((byte) 0xD8);
		media.delete(id);
		mvc.perform(get(media.url(id, ImageVariant.THUMB))).andExpect(status().isNotFound());
	}

	@Test
	void unknownIdIs404() throws Exception {
		mvc.perform(get("/media/does-not-exist/thumb.jpg")).andExpect(status().isNotFound());
		mvc.perform(get("/media/does-not-exist/bogus.jpg")).andExpect(status().isNotFound());
	}

	@Test
	void failedStoreLeavesNothingBehind() throws Exception {
		long before = countBlobs();
		assertThatThrownBy(() -> media.store(TestImages.fakeJpgPdf(), Set.of(ImageVariant.values())))
				.isInstanceOf(ApiException.class);
		assertThat(countBlobs()).isEqualTo(before);
	}

	@Test
	void partialWriteFailureCleansUp() {
		BlobStore failing = new BlobStore() {
			final java.util.Map<String, byte[]> m = new java.util.HashMap<>();
			int puts;

			public void put(String key, byte[] data, String ct) {
				if (++puts == 2) {
					throw new IllegalStateException("boom");
				}
				m.put(key, data);
			}

			public java.util.Optional<byte[]> get(String key) {
				return java.util.Optional.ofNullable(m.get(key));
			}

			public void delete(String key) {
				m.remove(key);
			}
		};
		MediaService svc = new MediaService(failing, new ImageProcessor(), new ProcessingLimiter(2, java.time.Duration.ofSeconds(30)));
		assertThatThrownBy(() -> svc.store(TestImages.plainJpeg(500, 500), Set.of(ImageVariant.values())))
				.isInstanceOf(IllegalStateException.class);
		assertThat(((java.util.Map<?, ?>) readField(failing)).isEmpty()).isTrue();
	}

	private static Object readField(BlobStore b) {
		try {
			var f = b.getClass().getDeclaredField("m");
			f.setAccessible(true);
			return f.get(b);
		}
		catch (Exception e) {
			throw new IllegalStateException(e);
		}
	}

	@org.springframework.web.bind.annotation.RestController
	static class ThrowingController {
		@org.springframework.web.bind.annotation.PostMapping("/boom")
		void boom() {
			throw new MaxUploadSizeExceededException(15L * 1024 * 1024);
		}
	}

	@Test
	void oversizedUploadRendersFileTooLarge() throws Exception {
		// Boot 4 / Spring 7 raises MaxUploadSizeExceededException (an ErrorResponse) for oversized multipart bodies.
		var standalone = org.springframework.test.web.servlet.setup.MockMvcBuilders.standaloneSetup(new ThrowingController())
				.setControllerAdvice(new com.ricettine.common.ProblemAdvice()).build();
		standalone.perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post("/boom"))
				.andExpect(status().isPayloadTooLarge()).andExpect(jsonPath("$.code").value("file_too_large"));
	}

	private long countBlobs() throws Exception {
		Path p = Path.of(root, "img");
		if (!Files.exists(p)) {
			return 0;
		}
		try (Stream<Path> s = Files.walk(p)) {
			return s.filter(Files::isRegularFile).count();
		}
	}
}

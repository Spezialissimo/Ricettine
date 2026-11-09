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
import com.ricettine.common.ProblemAdvice;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Duration;
import java.util.HashMap;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;
import java.util.stream.Stream;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MaxUploadSizeExceededException;

class MediaIT extends IntegrationTest {

	@Autowired
	MediaService media;

	@Autowired
	BlobStore blobs;

	@Value("${ricettine.storage.local.path}")
	String root;

	UUID owner;

	@BeforeEach
	void owner() {
		owner = data.account("m@x.com", "mediaowner", "Media", true).getId();
	}

	@Test
	void storedImageIsServedWithImmutableCache() throws Exception {
		String id = media.register(media.process(TestImages.orientation6(), Set.of(ImageVariant.THUMB, ImageVariant.DISPLAY)), owner, MediaKind.AVATAR, null);
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

	@Autowired
	PlatformTransactionManager txManager;

	@Test
	void processRefusesToRunInsideATransaction() {
		// The limiter wait and the decode must never hold a pooled DB connection.
		var tx = new TransactionTemplate(txManager);
		assertThatThrownBy(() -> tx.execute(s -> media.process(TestImages.plainJpeg(50, 50), Set.of(ImageVariant.THUMB))))
				.isInstanceOf(IllegalStateException.class).hasMessageContaining("transaction");
	}

	@Test
	void registeredBlobsAreRemovedWhenTheTransactionRollsBack() throws Exception {
		ProcessedUpload upload = media.process(TestImages.plainJpeg(50, 50), Set.of(ImageVariant.THUMB));
		long before = countBlobs();
		String id = new TransactionTemplate(txManager).execute(s -> {
			String registered = media.register(upload, owner, MediaKind.RECIPE, null);
			s.setRollbackOnly();
			return registered;
		});
		assertThat(blobs.get(MediaService.key(id, ImageVariant.THUMB))).isEmpty();
		assertThat(countBlobs()).isEqualTo(before);
		assertThat(jdbc.queryForObject("select count(*) from media where id = ?", Integer.class, id)).isZero();
	}

	@Test
	void unknownIdIs404() throws Exception {
		mvc.perform(get("/media/does-not-exist/thumb.jpg")).andExpect(status().isNotFound());
		mvc.perform(get("/media/does-not-exist/bogus.jpg")).andExpect(status().isNotFound());
	}

	@Test
	void failedStoreLeavesNothingBehind() throws Exception {
		long before = countBlobs();
		assertThatThrownBy(() -> media.register(media.process(TestImages.fakeJpgPdf(), Set.of(ImageVariant.values())), owner, MediaKind.AVATAR, null))
				.isInstanceOf(ApiException.class);
		assertThat(countBlobs()).isEqualTo(before);
	}

	@Test
	void partialWriteFailureCleansUp() {
		BlobStore failing = new BlobStore() {
			final Map<String, byte[]> m = new HashMap<>();
			int puts;

			public void put(String key, byte[] data, String ct) {
				if (++puts == 2) {
					throw new IllegalStateException("boom");
				}
				m.put(key, data);
			}

			public Optional<byte[]> get(String key) {
				return Optional.ofNullable(m.get(key));
			}

			public void delete(String key) {
				m.remove(key);
			}
		};
		MediaService svc = new MediaService(failing, new ImageProcessor(), new ProcessingLimiter(2, Duration.ofSeconds(30)), null, null);
		ProcessedUpload upload = svc.process(TestImages.plainJpeg(500, 500), Set.of(ImageVariant.values()));
		assertThatThrownBy(() -> svc.register(upload, owner, MediaKind.AVATAR, null))
				.isInstanceOf(IllegalStateException.class);
		assertThat(((Map<?, ?>) readField(failing)).isEmpty()).isTrue();
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

	@RestController
	static class ThrowingController {
		@PostMapping("/boom")
		void boom() {
			throw new MaxUploadSizeExceededException(15L * 1024 * 1024);
		}
	}

	@Test
	void oversizedUploadRendersFileTooLarge() throws Exception {
		// Boot 4 / Spring 7 raises MaxUploadSizeExceededException (an ErrorResponse) for oversized multipart bodies.
		var standalone = MockMvcBuilders.standaloneSetup(new ThrowingController())
				.setControllerAdvice(new ProblemAdvice()).build();
		standalone.perform(MockMvcRequestBuilders.post("/boom"))
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

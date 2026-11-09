package com.ricettine.recipe;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.multipart;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.ricettine.IntegrationTest;
import com.ricettine.media.ProcessingLimiter;
import com.ricettine.media.TestImages;
import com.ricettine.testsupport.CountingFile;
import com.ricettine.testsupport.HeldPermit;
import jakarta.servlet.http.Cookie;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;
import org.springframework.test.context.TestPropertySource;

/** One processing permit and a tiny wait, so a held permit makes the upload endpoint answer 503 busy. */
@TestPropertySource(properties = { "ricettine.media.max-concurrent-processing=1",
		"ricettine.media.processing-wait=50ms" })
class RecipePhotoBusyIT extends IntegrationTest {

	@Autowired ProcessingLimiter limiter;

	@Test
	void uploadBytesAreNotReadUntilAPermitIsHeld() throws Exception {
		Cookie me = data.user("me@x.com", "mario", "Me", true);
		String id = data.draft(me);
		CountingFile queued = new CountingFile(TestImages.plainJpeg(100, 100));
		try (HeldPermit permit = HeldPermit.acquire(limiter)) {
			mvc.perform(multipart("/api/recipes/" + id + "/photos").file(queued).with(csrf()).cookie(me))
				.andExpect(status().isServiceUnavailable()).andExpect(jsonPath("$.code").value("busy"));
			assertThat(queued.reads()).as("bytes read while no permit was available").isZero();
		}
		CountingFile admitted = new CountingFile(TestImages.plainJpeg(100, 100));
		mvc.perform(multipart("/api/recipes/" + id + "/photos").file(admitted).with(csrf()).cookie(me))
			.andExpect(status().isCreated());
		assertThat(admitted.reads()).isEqualTo(1);
	}

	@Test
	void uploadWhileAllPermitsAreHeldIs503Busy() throws Exception {
		Cookie me = data.user("me@x.com", "mario", "Me", true);
		String id = data.draft(me);
		try (HeldPermit permit = HeldPermit.acquire(limiter)) {
			data.uploadPhoto(me, id, TestImages.plainJpeg(100, 100))
				.andExpect(status().isServiceUnavailable())
				.andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_PROBLEM_JSON))
				.andExpect(header().string("Retry-After", "10"))
				.andExpect(jsonPath("$.code").value("busy"));
		}
		assertThat(jdbc.queryForObject("select count(*) from media", Integer.class)).isZero();
	}
}

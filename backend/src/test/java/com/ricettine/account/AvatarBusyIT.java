package com.ricettine.account;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.multipart;
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
import org.springframework.http.HttpMethod;
import org.springframework.test.context.TestPropertySource;

/** One processing permit and a tiny wait: a queued avatar upload must not read its file before holding a permit. */
@TestPropertySource(properties = { "ricettine.media.max-concurrent-processing=1",
		"ricettine.media.processing-wait=50ms" })
class AvatarBusyIT extends IntegrationTest {

	@Autowired ProcessingLimiter limiter;

	@Test
	void avatarUploadWaitsForSlotBeforeReading() throws Exception {
		Cookie me = data.user("me@x.com", "mario", "Me", true);
		CountingFile queued = new CountingFile(TestImages.plainJpeg(100, 100));
		try (HeldPermit permit = HeldPermit.acquire(limiter)) {
			mvc.perform(multipart(HttpMethod.PUT, "/api/me/avatar").file(queued).with(csrf()).cookie(me))
				.andExpect(status().isServiceUnavailable()).andExpect(jsonPath("$.code").value("busy"));
			assertThat(queued.reads()).as("bytes read while no permit was available").isZero();
		}
		CountingFile admitted = new CountingFile(TestImages.plainJpeg(100, 100));
		mvc.perform(multipart(HttpMethod.PUT, "/api/me/avatar").file(admitted).with(csrf()).cookie(me))
			.andExpect(status().isOk());
		assertThat(admitted.reads()).isEqualTo(1);
	}
}

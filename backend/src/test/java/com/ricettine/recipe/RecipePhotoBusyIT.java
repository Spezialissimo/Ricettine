package com.ricettine.recipe;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.multipart;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.ricettine.IntegrationTest;
import com.ricettine.Sessions;
import com.ricettine.account.AccountDtos.NewAccountRequest;
import com.ricettine.account.AccountService;
import com.ricettine.media.ProcessingLimiter;
import com.ricettine.media.TestImages;
import jakarta.servlet.http.Cookie;
import java.io.IOException;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.test.context.TestPropertySource;
import tools.jackson.databind.ObjectMapper;

/** One processing permit and a tiny wait, so a held permit makes the upload endpoint answer 503 busy. */
@TestPropertySource(properties = { "ricettine.media.max-concurrent-processing=1",
		"ricettine.media.processing-wait=50ms" })
class RecipePhotoBusyIT extends IntegrationTest {

	@Autowired JdbcTemplate jdbc;
	@Autowired AccountService accounts;
	@Autowired ObjectMapper json;
	@Autowired ProcessingLimiter limiter;

	/** Counts how often the upload bytes are materialised. */
	static class CountingFile extends MockMultipartFile {
		final AtomicInteger reads = new AtomicInteger();

		CountingFile(byte[] bytes) {
			super("file", "p.jpg", "image/jpeg", bytes);
		}

		@Override
		public byte[] getBytes() throws IOException {
			reads.incrementAndGet();
			return super.getBytes();
		}
	}

	@Test
	void uploadBytesAreNotReadUntilAPermitIsHeld() throws Exception {
		jdbc.execute("truncate table app_user, one_time_token, instance_setup cascade");
		jdbc.execute("delete from spring_session");
		accounts.create(new NewAccountRequest("me@x.com", Sessions.PASSWORD, "mario", "Me"), true);
		Cookie me = Sessions.login(mvc, "me@x.com");
		String id = json.readTree(mvc.perform(post("/api/recipes").with(csrf()).cookie(me))
			.andExpect(status().isCreated()).andReturn().getResponse().getContentAsString()).get("id").asText();

		CountDownLatch held = new CountDownLatch(1);
		CountDownLatch release = new CountDownLatch(1);
		CompletableFuture<Void> holder = CompletableFuture.runAsync(() -> limiter.run(() -> {
			held.countDown();
			try {
				release.await(30, TimeUnit.SECONDS);
			}
			catch (InterruptedException e) {
				Thread.currentThread().interrupt();
			}
			return null;
		}));
		CountingFile queued = new CountingFile(TestImages.plainJpeg(100, 100));
		try {
			assertThat(held.await(10, TimeUnit.SECONDS)).isTrue();
			mvc.perform(multipart("/api/recipes/" + id + "/photos").file(queued).with(csrf()).cookie(me))
				.andExpect(status().isServiceUnavailable()).andExpect(jsonPath("$.code").value("busy"));
			assertThat(queued.reads.get()).as("bytes read while no permit was available").isZero();
		}
		finally {
			release.countDown();
			holder.get(10, TimeUnit.SECONDS);
		}
		CountingFile admitted = new CountingFile(TestImages.plainJpeg(100, 100));
		mvc.perform(multipart("/api/recipes/" + id + "/photos").file(admitted).with(csrf()).cookie(me))
			.andExpect(status().isCreated());
		assertThat(admitted.reads.get()).isEqualTo(1);
	}

	@Test
	void uploadWhileAllPermitsAreHeldIs503Busy() throws Exception {
		jdbc.execute("truncate table app_user, one_time_token, instance_setup cascade");
		jdbc.execute("delete from spring_session");
		accounts.create(new NewAccountRequest("me@x.com", Sessions.PASSWORD, "mario", "Me"), true);
		Cookie me = Sessions.login(mvc, "me@x.com");
		String id = json.readTree(mvc.perform(post("/api/recipes").with(csrf()).cookie(me))
			.andExpect(status().isCreated()).andReturn().getResponse().getContentAsString()).get("id").asText();

		CountDownLatch held = new CountDownLatch(1);
		CountDownLatch release = new CountDownLatch(1);
		CompletableFuture<Void> holder = CompletableFuture.runAsync(() -> limiter.run(() -> {
			held.countDown();
			try {
				release.await(30, TimeUnit.SECONDS);
			}
			catch (InterruptedException e) {
				Thread.currentThread().interrupt();
			}
			return null;
		}));
		try {
			assertThat(held.await(10, TimeUnit.SECONDS)).isTrue();
			mvc.perform(multipart("/api/recipes/" + id + "/photos")
				.file(new MockMultipartFile("file", "p.jpg", "image/jpeg", TestImages.plainJpeg(100, 100)))
				.with(csrf()).cookie(me))
				.andExpect(status().isServiceUnavailable())
				.andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_PROBLEM_JSON))
				.andExpect(jsonPath("$.code").value("busy"));
		}
		finally {
			release.countDown();
			holder.get(10, TimeUnit.SECONDS);
		}
		assertThat(jdbc.queryForObject("select count(*) from media", Integer.class)).isZero();
	}
}

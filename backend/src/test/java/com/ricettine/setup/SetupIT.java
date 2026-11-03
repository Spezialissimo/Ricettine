package com.ricettine.setup;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.ricettine.IntegrationTest;
import com.ricettine.account.UserRepository;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;

class SetupIT extends IntegrationTest {

	@Autowired JdbcTemplate jdbc;
	@Autowired UserRepository userRepository;

	@BeforeEach
	void clean() {
		jdbc.execute("truncate table app_user, one_time_token, instance_setup cascade");
	}

	private static String body(String email, String username, String password) {
		return """
			{"email":"%s","password":"%s","username":"%s","displayName":"Davide"}""".formatted(email, password, username);
	}

	private int postStatus(String json) throws Exception {
		return mvc.perform(post("/api/setup/admin").with(csrf()).contentType(MediaType.APPLICATION_JSON).content(json))
			.andReturn().getResponse().getStatus();
	}

	@Test
	void statusRequiredWhenNoUsers() throws Exception {
		mvc.perform(get("/api/setup/status")).andExpect(status().isOk())
			.andExpect(jsonPath("$.setupRequired").value(true));
	}

	@Test
	void createsAdminOnce() throws Exception {
		String json = body("Davide@X.com", "davide", "correct-horse-1");
		mvc.perform(post("/api/setup/admin").with(csrf()).contentType(MediaType.APPLICATION_JSON).content(json))
			.andExpect(status().isCreated())
			.andExpect(jsonPath("$.admin").value(true))
			.andExpect(jsonPath("$.email").value("davide@x.com"));
		mvc.perform(post("/api/setup/admin").with(csrf()).contentType(MediaType.APPLICATION_JSON)
				.content(body("other@x.com", "other", "correct-horse-1")))
			.andExpect(status().isConflict())
			.andExpect(jsonPath("$.code").value("setup_already_done"));
		mvc.perform(get("/api/setup/status")).andExpect(jsonPath("$.setupRequired").value(false));
	}

	@Test
	void concurrentSetupCreatesOneAdmin() throws Exception {
		int n = 5;
		ExecutorService pool = Executors.newFixedThreadPool(n);
		CountDownLatch start = new CountDownLatch(1);
		List<Future<Integer>> results = new ArrayList<>();
		for (int i = 0; i < n; i++) {
			String json = body("admin" + i + "@x.com", "admin_" + i, "correct-horse-1");
			results.add(pool.submit(() -> {
				start.await();
				return postStatus(json);
			}));
		}
		start.countDown();
		List<Integer> statuses = new ArrayList<>();
		for (Future<Integer> f : results) {
			statuses.add(f.get());
		}
		pool.shutdown();
		assertThat(statuses.stream().filter(s -> s == 201).count()).isEqualTo(1);
		assertThat(statuses.stream().filter(s -> s == 409).count()).isEqualTo(n - 1);
		assertThat(userRepository.count()).isEqualTo(1);
	}

	@Test
	void rejectsShortPassword() throws Exception {
		mvc.perform(post("/api/setup/admin").with(csrf()).contentType(MediaType.APPLICATION_JSON)
				.content(body("a@x.com", "davide", "123456789")))
			.andExpect(status().isBadRequest())
			.andExpect(jsonPath("$.code").value("password_too_short"));
	}

	@Test
	void rejectsBlankDisplayName() throws Exception {
		mvc.perform(post("/api/setup/admin").with(csrf()).contentType(MediaType.APPLICATION_JSON)
				.content("{\"email\":\"a@x.com\",\"password\":\"correct-horse-1\",\"username\":\"davide\",\"displayName\":\"  \"}"))
			.andExpect(status().isBadRequest())
			.andExpect(jsonPath("$.code").value("validation_failed"))
			.andExpect(jsonPath("$.fields.displayName").exists());
	}

	@Test
	void unreadableBodyIsBadRequest() throws Exception {
		mvc.perform(post("/api/setup/admin").with(csrf()).contentType(MediaType.APPLICATION_JSON).content("{nope"))
			.andExpect(status().isBadRequest())
			.andExpect(jsonPath("$.code").value("bad_request"));
	}

	@Test
	void failedSetupDoesNotConsumeTheGuard() throws Exception {
		mvc.perform(post("/api/setup/admin").with(csrf()).contentType(MediaType.APPLICATION_JSON)
				.content(body("a@x.com", "davide", "short")))
			.andExpect(status().isBadRequest());
		mvc.perform(get("/api/setup/status")).andExpect(jsonPath("$.setupRequired").value(true));
	}
}

package com.ricettine.auth;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.ricettine.IntegrationTest;
import com.ricettine.account.AccountDtos.NewAccountRequest;
import com.ricettine.account.AccountService;
import com.ricettine.account.User;
import jakarta.servlet.http.Cookie;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.web.servlet.MvcResult;

class AuthIT extends IntegrationTest {

	@Autowired JdbcTemplate jdbc;
	@Autowired AccountService accounts;
	@Autowired AuthSessions authSessions;

	@BeforeEach
	void clean() {
		jdbc.execute("truncate table app_user, one_time_token, instance_setup cascade");
		jdbc.execute("delete from spring_session");
	}

	private User user(String email, String username, boolean admin) {
		return accounts.create(new NewAccountRequest(email, "correct-horse-1", username, "Davide"), admin);
	}

	private MvcResult login(String email, String password) throws Exception {
		return mvc.perform(post("/api/auth/login").with(csrf()).contentType(MediaType.APPLICATION_JSON)
				.content("{\"email\":\"%s\",\"password\":\"%s\"}".formatted(email, password))).andReturn();
	}

	private static Cookie session(MvcResult r) {
		Cookie c = r.getResponse().getCookie("SESSION");
		assertThat(c).as("SESSION cookie").isNotNull();
		assertThat(r.getResponse().getHeaders("Set-Cookie")).as("hdrs").anyMatch(h -> h.startsWith("SESSION=") && h.contains("HttpOnly") && h.contains("SameSite=Lax"));
		return c;
	}

	@Test
	void loginWithAnyCaseEmail() throws Exception {
		user("davide@x.com", "davide", false);
		MvcResult r = login(" DAVIDE@x.com", "correct-horse-1");
		assertThat(r.getResponse().getStatus()).isEqualTo(200);
		mvc.perform(get("/api/me").cookie(session(r)))
			.andExpect(status().isOk())
			.andExpect(jsonPath("$.username").value("davide"));
	}

	@Test
	void wrongPasswordIs401() throws Exception {
		user("davide@x.com", "davide", false);
		for (String[] c : new String[][] {{"davide@x.com", "wrong-password-1"}, {"nobody@x.com", "wrong-password-1"}}) {
			mvc.perform(post("/api/auth/login").with(csrf()).contentType(MediaType.APPLICATION_JSON)
					.content("{\"email\":\"%s\",\"password\":\"%s\"}".formatted(c[0], c[1])))
				.andExpect(status().isUnauthorized())
				.andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_PROBLEM_JSON))
				.andExpect(jsonPath("$.code").value("bad_credentials"));
		}
	}

	@Test
	void meWithoutSessionIs401Json() throws Exception {
		mvc.perform(get("/api/me"))
			.andExpect(status().isUnauthorized())
			.andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_PROBLEM_JSON))
			.andExpect(jsonPath("$.code").value("not_authenticated"));
	}

	@Test
	void logoutEndsSession() throws Exception {
		user("davide@x.com", "davide", false);
		Cookie s = session(login("davide@x.com", "correct-horse-1"));
		mvc.perform(post("/api/auth/logout").with(csrf()).cookie(s)).andExpect(status().isNoContent());
		mvc.perform(get("/api/me").cookie(s)).andExpect(status().isUnauthorized());
	}

	@Test
	void adminEndpointForbiddenForNonAdmin() throws Exception {
		user("davide@x.com", "davide", false);
		Cookie s = session(login("davide@x.com", "correct-horse-1"));
		mvc.perform(get("/api/admin/users").cookie(s))
			.andExpect(status().isForbidden())
			.andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_PROBLEM_JSON))
			.andExpect(jsonPath("$.code").value("forbidden"));
	}

	@Test
	void setupLogsInAdmin() throws Exception {
		MvcResult r = mvc.perform(post("/api/setup/admin").with(csrf()).contentType(MediaType.APPLICATION_JSON)
				.content("{\"email\":\"a@x.com\",\"password\":\"correct-horse-1\",\"username\":\"davide\",\"displayName\":\"D\"}"))
			.andExpect(status().isCreated()).andReturn();
		mvc.perform(get("/api/me").cookie(session(r)))
			.andExpect(status().isOk())
			.andExpect(jsonPath("$.admin").value(true));
	}

	@Test
	void sessionIsIndexedByUserIdAndCanBeInvalidated() throws Exception {
		User u = user("davide@x.com", "davide", false);
		Cookie s = session(login("davide@x.com", "correct-horse-1"));
		Integer n = jdbc.queryForObject("select count(*) from spring_session where principal_name = ?",
				Integer.class, u.getId().toString());
		assertThat(n).isEqualTo(1);
		authSessions.invalidateAllSessions(u.getId());
		mvc.perform(get("/api/me").cookie(s)).andExpect(status().isUnauthorized());
	}

	@Test
	void sessionIdRotatesOnLogin() throws Exception {
		user("davide@x.com", "davide", false);
		Cookie first = session(login("davide@x.com", "correct-horse-1"));
		MvcResult r = mvc.perform(post("/api/auth/login").with(csrf()).cookie(first)
				.contentType(MediaType.APPLICATION_JSON)
				.content("{\"email\":\"davide@x.com\",\"password\":\"correct-horse-1\"}")).andReturn();
		assertThat(session(r).getValue()).isNotEqualTo(first.getValue());
		mvc.perform(get("/api/me").cookie(first)).andExpect(status().isUnauthorized());
	}

	@Test
	void malformedLoginBodyIs400() throws Exception {
		mvc.perform(post("/api/auth/login").with(csrf()).contentType(MediaType.APPLICATION_JSON).content("{}"))
			.andExpect(status().isBadRequest());
	}

	@Test
	void longAndMultibytePasswordsWork() throws Exception {
		String ascii128 = "a".repeat(128);
		String multibyte = "\u00e8".repeat(60); // 120 UTF-8 bytes
		for (String[] c : new String[][] {{"a@x.com", "usera", ascii128}, {"b@x.com", "userb", multibyte}}) {
			User u = accounts.create(new NewAccountRequest(c[0], c[2], c[1], "D"), false);
			assertThat(jdbc.queryForObject("select password_hash from app_user where id = ?", String.class, u.getId()))
				.startsWith("{argon2}");
			assertThat(login(c[0], c[2]).getResponse().getStatus()).isEqualTo(200);
		}
	}

	@Test
	void legacyBcryptHashStillLogsIn() throws Exception {
		User u = user("old@x.com", "olduser", false);
		String bcrypt = "{bcrypt}" + new org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder()
			.encode("correct-horse-1");
		jdbc.update("update app_user set password_hash = ? where id = ?", bcrypt, u.getId());
		assertThat(login("old@x.com", "correct-horse-1").getResponse().getStatus()).isEqualTo(200);
	}
}

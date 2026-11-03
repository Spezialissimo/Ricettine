package com.ricettine.admin;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.ricettine.IntegrationTest;
import com.ricettine.Sessions;
import com.ricettine.account.AccountDtos.NewAccountRequest;
import com.ricettine.account.AccountService;
import com.ricettine.account.User;
import com.ricettine.account.UserRepository;
import jakarta.servlet.http.Cookie;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.web.servlet.ResultActions;

/** Ruling R9: admins can promote and demote users, so the sole admin is never stuck. */
class AdminRoleIT extends IntegrationTest {

	@Autowired JdbcTemplate jdbc;
	@Autowired AccountService accounts;
	@Autowired UserRepository users;

	User boss;
	User member;
	Cookie admin;

	@BeforeEach
	void setUp() throws Exception {
		jdbc.execute("truncate table app_user, one_time_token, instance_setup cascade");
		jdbc.execute("delete from spring_session");
		boss = accounts.create(new NewAccountRequest("admin@x.com", Sessions.PASSWORD, "boss", "Boss"), true);
		member = accounts.create(new NewAccountRequest("m@x.com", Sessions.PASSWORD, "member", "Member"), false);
		admin = Sessions.login(mvc, "admin@x.com");
	}

	private ResultActions setAdmin(Cookie as, UUID target, String body) throws Exception {
		return mvc.perform(post("/api/admin/users/" + target + "/admin").with(csrf()).cookie(as)
			.contentType(MediaType.APPLICATION_JSON).content(body));
	}

	private ResultActions setAdmin(Cookie as, UUID target, boolean value) throws Exception {
		return setAdmin(as, target, "{\"admin\":" + value + "}");
	}

	@Test
	void promotingEndsTheTargetsOldSessions() throws Exception {
		Cookie old = Sessions.login(mvc, "m@x.com");
		mvc.perform(get("/api/admin/users").cookie(old)).andExpect(status().isForbidden());

		setAdmin(admin, member.getId(), true).andExpect(status().isOk())
			.andExpect(jsonPath("$.id").value(member.getId().toString()))
			.andExpect(jsonPath("$.username").value("member"))
			.andExpect(jsonPath("$.admin").value(true));

		assertThat(users.findById(member.getId()).orElseThrow().isAdmin()).isTrue();
		// the old session snapshotted ROLE_USER only: it is gone, not silently upgraded or left stale
		mvc.perform(get("/api/admin/users").cookie(old)).andExpect(status().isUnauthorized());
		mvc.perform(get("/api/me").cookie(old)).andExpect(status().isUnauthorized());
		// the acting admin stays signed in
		mvc.perform(get("/api/admin/users").cookie(admin)).andExpect(status().isOk());
		// a fresh login carries the new role
		mvc.perform(get("/api/admin/users").cookie(Sessions.login(mvc, "m@x.com"))).andExpect(status().isOk());
	}

	@Test
	void demotingEndsTheTargetsSessions() throws Exception {
		setAdmin(admin, member.getId(), true).andExpect(status().isOk());
		Cookie second = Sessions.login(mvc, "m@x.com");
		mvc.perform(get("/api/admin/users").cookie(second)).andExpect(status().isOk());

		setAdmin(admin, member.getId(), false).andExpect(status().isOk()).andExpect(jsonPath("$.admin").value(false));

		mvc.perform(get("/api/admin/users").cookie(second)).andExpect(status().isUnauthorized());
		mvc.perform(get("/api/admin/users").cookie(Sessions.login(mvc, "m@x.com"))).andExpect(status().isForbidden());
	}

	@Test
	void demotingTheLastAdminIs409() throws Exception {
		setAdmin(admin, boss.getId(), false).andExpect(status().isConflict())
			.andExpect(jsonPath("$.code").value("last_admin"));
		assertThat(users.findById(boss.getId()).orElseThrow().isAdmin()).isTrue();
		mvc.perform(get("/api/admin/users").cookie(admin)).andExpect(status().isOk());
	}

	@Test
	void soleAdminPromotesSomeoneThenCanDeleteOwnAccount() throws Exception {
		mvc.perform(delete("/api/me").with(csrf()).cookie(admin).contentType(MediaType.APPLICATION_JSON)
				.content("{\"password\":\"%s\"}".formatted(Sessions.PASSWORD)))
			.andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("last_admin"));

		setAdmin(admin, member.getId(), true).andExpect(status().isOk());

		mvc.perform(delete("/api/me").with(csrf()).cookie(admin).contentType(MediaType.APPLICATION_JSON)
				.content("{\"password\":\"%s\"}".formatted(Sessions.PASSWORD)))
			.andExpect(status().isNoContent());
		assertThat(users.findById(boss.getId())).isEmpty();
		assertThat(users.findById(member.getId()).orElseThrow().isAdmin()).isTrue();
	}

	@Test
	void adminCanStepDownWhenAnotherAdminExists() throws Exception {
		setAdmin(admin, member.getId(), true).andExpect(status().isOk());
		setAdmin(admin, boss.getId(), false).andExpect(status().isOk()).andExpect(jsonPath("$.admin").value(false));
		// own sessions end too: the client must sign in again
		mvc.perform(get("/api/me").cookie(admin)).andExpect(status().isUnauthorized());
		assertThat(jdbc.queryForObject("select count(*) from spring_session where principal_name = ?",
				Integer.class, boss.getId().toString())).isZero();
	}

	@Test
	void unchangedRoleKeepsSessions() throws Exception {
		Cookie m = Sessions.login(mvc, "m@x.com");
		setAdmin(admin, member.getId(), false).andExpect(status().isOk()).andExpect(jsonPath("$.admin").value(false));
		mvc.perform(get("/api/me").cookie(m)).andExpect(status().isOk());
	}

	@Test
	void rejectsNonAdminsUnknownUsersAndBadBodies() throws Exception {
		Cookie m = Sessions.login(mvc, "m@x.com");
		setAdmin(m, member.getId(), true).andExpect(status().isForbidden());
		setAdmin(admin, UUID.randomUUID(), true).andExpect(status().isNotFound())
			.andExpect(jsonPath("$.code").value("not_found"));
		setAdmin(admin, member.getId(), "{}").andExpect(status().isBadRequest());
		assertThat(users.findById(member.getId()).orElseThrow().isAdmin()).isFalse();
	}
}

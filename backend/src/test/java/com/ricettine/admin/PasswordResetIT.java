package com.ricettine.admin;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.ricettine.IntegrationTest;
import com.ricettine.Sessions;
import com.ricettine.account.AccountDtos.NewAccountRequest;
import com.ricettine.account.AccountService;
import com.ricettine.account.User;
import com.ricettine.common.Tokens;
import jakarta.servlet.http.Cookie;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.web.servlet.MvcResult;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;

class PasswordResetIT extends IntegrationTest {

	@Autowired JdbcTemplate jdbc;
	@Autowired AccountService accounts;
	@Autowired ObjectMapper json;

	Cookie admin;
	User member;

	@BeforeEach
	void setUp() throws Exception {
		jdbc.execute("truncate table app_user, one_time_token, instance_setup cascade");
		jdbc.execute("delete from spring_session");
		accounts.create(new NewAccountRequest("admin@x.com", Sessions.PASSWORD, "boss", "Boss"), true);
		member = accounts.create(new NewAccountRequest("m@x.com", Sessions.PASSWORD, "member", "Member"), false);
		admin = Sessions.login(mvc, "admin@x.com");
	}

	private String createLink(UUID userId) throws Exception {
		MvcResult r = mvc.perform(post("/api/admin/users/" + userId + "/password-reset").with(csrf()).cookie(admin))
			.andExpect(status().isCreated()).andExpect(jsonPath("$.expiresAt").exists()).andReturn();
		JsonNode n = json.readTree(r.getResponse().getContentAsString());
		String url = n.get("url").asText();
		assertThat(url).startsWith("http://localhost/reset/");
		return url.substring(url.lastIndexOf('/') + 1);
	}

	private MvcResult redeem(String token, String pw) throws Exception {
		return mvc.perform(post("/api/password-resets/" + token).with(csrf()).contentType(MediaType.APPLICATION_JSON)
				.content("{\"newPassword\":\"%s\"}".formatted(pw))).andReturn();
	}

	@Test
	void resetFlow() throws Exception {
		Cookie old = Sessions.login(mvc, "m@x.com");
		String token = createLink(member.getId());
		// creating the link does not log anyone out
		mvc.perform(get("/api/me").cookie(old)).andExpect(status().isOk());
		assertThat(jdbc.queryForObject("select purpose from one_time_token", String.class)).isEqualTo("PASSWORD_RESET");
		assertThat(jdbc.queryForObject("select token_hash from one_time_token", String.class))
			.isEqualTo(Tokens.hash(token));

		assertThat(redeem(token, "fresh-password-9").getResponse().getStatus()).isEqualTo(204);
		mvc.perform(get("/api/me").cookie(old)).andExpect(status().isUnauthorized());
		assertThat(Sessions.login(mvc, "m@x.com", Sessions.PASSWORD)).isNull();
		assertThat(Sessions.login(mvc, "m@x.com", "fresh-password-9")).isNotNull();

		MvcResult again = redeem(token, "another-password-9");
		assertThat(again.getResponse().getStatus()).isEqualTo(404);
		assertThat(again.getResponse().getContentAsString()).contains("reset_invalid");
	}

	@Test
	void expiredLinkIs404() throws Exception {
		String token = createLink(member.getId());
		jdbc.update("update one_time_token set expires_at = now() - interval '1 minute'");
		MvcResult r = redeem(token, "fresh-password-9");
		assertThat(r.getResponse().getStatus()).isEqualTo(404);
		assertThat(r.getResponse().getContentAsString()).contains("reset_invalid");
		assertThat(Sessions.login(mvc, "m@x.com", Sessions.PASSWORD)).isNotNull();
	}

	@Test
	void weakPasswordKeepsLinkUsable() throws Exception {
		String token = createLink(member.getId());
		MvcResult weak = redeem(token, "short");
		assertThat(weak.getResponse().getStatus()).isEqualTo(400);
		assertThat(weak.getResponse().getContentAsString()).contains("password_too_short");
		assertThat(redeem(token, "fresh-password-9").getResponse().getStatus()).isEqualTo(204);
	}

	@Test
	void unknownTokenIs404() throws Exception {
		MvcResult r = redeem(Tokens.newToken(), "fresh-password-9");
		assertThat(r.getResponse().getStatus()).isEqualTo(404);
		assertThat(r.getResponse().getContentAsString()).contains("reset_invalid");
	}

	@Test
	void inviteTokenCannotResetPassword() throws Exception {
		MvcResult inv = mvc.perform(post("/api/admin/invites").with(csrf()).cookie(admin)).andReturn();
		String url = json.readTree(inv.getResponse().getContentAsString()).get("url").asText();
		String token = url.substring(url.lastIndexOf('/') + 1);
		assertThat(redeem(token, "fresh-password-9").getResponse().getStatus()).isEqualTo(404);
	}

	@Test
	void unknownUserIs404AndNonAdminForbidden() throws Exception {
		mvc.perform(post("/api/admin/users/" + UUID.randomUUID() + "/password-reset").with(csrf()).cookie(admin))
			.andExpect(status().isNotFound());
		Cookie user = Sessions.login(mvc, "m@x.com");
		mvc.perform(post("/api/admin/users/" + member.getId() + "/password-reset").with(csrf()).cookie(user))
			.andExpect(status().isForbidden());
		mvc.perform(get("/api/admin/users").cookie(user)).andExpect(status().isForbidden());
	}

	@Test
	void adminListsUsersNewestFirst() throws Exception {
		MvcResult r = mvc.perform(get("/api/admin/users").cookie(admin)).andExpect(status().isOk()).andReturn();
		String raw = r.getResponse().getContentAsString();
		JsonNode list = json.readTree(raw);
		assertThat(list).hasSize(2);
		assertThat(list.get(0).get("username").asText()).isEqualTo("member");
		assertThat(list.get(1).get("username").asText()).isEqualTo("boss");
		assertThat(list.get(1).get("admin").asBoolean()).isTrue();
		assertThat(list.get(0).propertyNames())
			.containsExactlyInAnyOrder("id", "username", "displayName", "email", "admin", "createdAt");
		assertThat(raw).doesNotContain("password");
	}
}

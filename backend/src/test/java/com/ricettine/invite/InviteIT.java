package com.ricettine.invite;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.ricettine.IntegrationTest;
import com.ricettine.QuietSqlErrors;
import com.ricettine.common.Tokens;
import com.ricettine.testsupport.Concurrently;
import jakarta.servlet.http.Cookie;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MvcResult;
import tools.jackson.databind.JsonNode;

class InviteIT extends IntegrationTest {

	Cookie admin;

	@BeforeEach
	void clean() throws Exception {
		admin = data.user("admin@x.com", "boss", "Boss", true);
	}

	private JsonNode createInvite() throws Exception {
		MvcResult r = mvc.perform(post("/api/admin/invites").with(csrf()).cookie(admin))
			.andExpect(status().isCreated())
			.andExpect(jsonPath("$.id").exists())
			.andExpect(jsonPath("$.expiresAt").exists())
			.andReturn();
		return json.readTree(r.getResponse().getContentAsString());
	}

	private static String tokenOf(JsonNode invite) {
		String url = invite.get("url").asText();
		assertThat(url).contains("/invite/");
		return url.substring(url.lastIndexOf('/') + 1);
	}

	private static String body(String email, String username) {
		return "{\"email\":\"%s\",\"password\":\"correct-horse-1\",\"username\":\"%s\",\"displayName\":\"New\"}"
			.formatted(email, username);
	}

	private MvcResult register(String token, String email, String username) throws Exception {
		return mvc.perform(post("/api/invites/" + token + "/register").with(csrf())
				.contentType(MediaType.APPLICATION_JSON).content(body(email, username))).andReturn();
	}

	@Test
	void adminCreatesInviteAndUserRegisters() throws Exception {
		JsonNode invite = createInvite();
		String token = tokenOf(invite);
		assertThat(invite.get("url").asText()).startsWith("http://localhost/invite/");
		mvc.perform(get("/api/invites/" + token)).andExpect(status().isOk()).andExpect(jsonPath("$.expiresAt").exists());
		// peeking does not consume
		mvc.perform(get("/api/invites/" + token)).andExpect(status().isOk());

		MvcResult r = register(token, "new@x.com", "newbie");
		assertThat(r.getResponse().getStatus()).isEqualTo(201);
		assertThat(json.readTree(r.getResponse().getContentAsString()).get("admin").asBoolean()).isFalse();
		mvc.perform(get("/api/me").cookie(r.getResponse().getCookie("SESSION")))
			.andExpect(status().isOk())
			.andExpect(jsonPath("$.username").value("newbie"))
			.andExpect(jsonPath("$.admin").value(false));
		mvc.perform(get("/api/invites/" + token)).andExpect(status().isNotFound())
			.andExpect(jsonPath("$.code").value("invite_invalid"));
	}

	@Test
	void inviteIsSingleUse() throws Exception {
		String token = tokenOf(createInvite());
		assertThat(register(token, "a@x.com", "usera").getResponse().getStatus()).isEqualTo(201);
		mvc.perform(post("/api/invites/" + token + "/register").with(csrf()).contentType(MediaType.APPLICATION_JSON)
				.content(body("b@x.com", "userb")))
			.andExpect(status().isNotFound())
			.andExpect(jsonPath("$.code").value("invite_invalid"));
	}

	@Test
	void concurrentRegistrationUsesInviteOnce() throws Exception {
		String token = tokenOf(createInvite());
		List<Integer> codes = Concurrently.run(2,
				i -> () -> register(token, (i == 0 ? "one" : "two") + "@x.com", "user" + (i == 0 ? "one" : "two"))
					.getResponse().getStatus());
		assertThat(codes).containsExactlyInAnyOrder(201, 404);
		assertThat(jdbc.queryForObject("select count(*) from app_user where not is_admin", Integer.class)).isEqualTo(1);
	}

	@Test
	void expiredInviteInvalid() throws Exception {
		String token = tokenOf(createInvite());
		jdbc.update("update one_time_token set expires_at = now() - interval '1 minute'");
		mvc.perform(get("/api/invites/" + token)).andExpect(status().isNotFound());
		MvcResult r = register(token, "a@x.com", "usera");
		assertThat(r.getResponse().getStatus()).isEqualTo(404);
		assertThat(r.getResponse().getContentAsString()).contains("invite_invalid");
	}

	@Test
	void revokedInviteInvalid() throws Exception {
		JsonNode invite = createInvite();
		String token = tokenOf(invite);
		mvc.perform(delete("/api/admin/invites/" + invite.get("id").asText()).with(csrf()).cookie(admin))
			.andExpect(status().isNoContent());
		mvc.perform(get("/api/invites/" + token)).andExpect(status().isNotFound());
		assertThat(register(token, "a@x.com", "usera").getResponse().getStatus()).isEqualTo(404);
		mvc.perform(get("/api/admin/invites").cookie(admin)).andExpect(jsonPath("$.length()").value(0));
	}

	@Test
	void unknownTokenIs404() throws Exception {
		mvc.perform(get("/api/invites/" + Tokens.newToken())).andExpect(status().isNotFound())
			.andExpect(jsonPath("$.code").value("invite_invalid"));
		assertThat(register(Tokens.newToken(), "a@x.com", "usera").getResponse().getStatus()).isEqualTo(404);
	}

	@Test
	@QuietSqlErrors
	void failedRegistrationKeepsInvite() throws Exception {
		String token = tokenOf(createInvite());
		assertThat(register(token, "a@x.com", "usera").getResponse().getStatus()).isEqualTo(201);
		String second = tokenOf(createInvite());
		MvcResult taken = register(second, "b@x.com", "usera");
		assertThat(taken.getResponse().getStatus()).isEqualTo(409);
		assertThat(taken.getResponse().getContentAsString()).contains("username_taken");
		assertThat(register(second, "b@x.com", "userb").getResponse().getStatus()).isEqualTo(201);
	}

	@Test
	void nonAdminCannotCreateInvite() throws Exception {
		String token = tokenOf(createInvite());
		MvcResult r = register(token, "a@x.com", "usera");
		Cookie user = r.getResponse().getCookie("SESSION");
		mvc.perform(post("/api/admin/invites").with(csrf()).cookie(user)).andExpect(status().isForbidden());
		mvc.perform(post("/api/admin/invites").with(csrf())).andExpect(status().isUnauthorized());
	}

	@Test
	void tokenNotStoredInPlaintext() throws Exception {
		JsonNode invite = createInvite();
		String token = tokenOf(invite);
		String stored = jdbc.queryForObject("select token_hash from one_time_token where id = ?", String.class,
				UUID.fromString(invite.get("id").asText()));
		assertThat(stored).isNotEqualTo(token).isEqualTo(Tokens.hash(token));
		assertThat(jdbc.queryForObject("select purpose from one_time_token", String.class)).isEqualTo("INSTANCE_INVITE");
		assertThat(jdbc.queryForObject("select created_by from one_time_token", UUID.class)).isNotNull();
	}

	@Test
	void listShowsOnlyActiveNewestFirstWithoutSecrets() throws Exception {
		JsonNode a = createInvite();
		JsonNode b = createInvite();
		JsonNode c = createInvite();
		jdbc.update("update one_time_token set used_at = now() where id = ?", UUID.fromString(a.get("id").asText()));
		MvcResult r = mvc.perform(get("/api/admin/invites").cookie(admin)).andExpect(status().isOk()).andReturn();
		String raw = r.getResponse().getContentAsString();
		JsonNode list = json.readTree(raw);
		assertThat(list).hasSize(2);
		assertThat(list.get(0).get("id").asText()).isEqualTo(c.get("id").asText());
		assertThat(list.get(1).get("id").asText()).isEqualTo(b.get("id").asText());
		assertThat(raw).doesNotContain("token").doesNotContain("url").contains("createdAt", "expiresAt");
	}
}

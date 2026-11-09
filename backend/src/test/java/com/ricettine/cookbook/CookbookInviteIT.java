package com.ricettine.cookbook;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.ricettine.common.Tokens;
import com.ricettine.testsupport.Concurrently;
import jakarta.servlet.http.Cookie;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.http.MediaType;
import tools.jackson.databind.JsonNode;

class CookbookInviteIT extends CookbookIT {

	@Test
	void createPreviewAcceptMakesAnAuthor() throws Exception {
		String id = data.createCookbook(owner);
		JsonNode created = data.read(mvc.perform(post("/api/cookbooks/" + id + "/invites").with(csrf()).cookie(owner))
			.andExpect(status().isCreated()).andReturn());
		String url = created.get("url").asText();
		assertThat(url).startsWith("http://localhost/cookbook-invite/");
		String token = url.substring(url.lastIndexOf('/') + 1);

		preview(bea, token).andExpect(status().isOk()).andExpect(jsonPath("$.cookbookName").value("Dinners"))
			.andExpect(jsonPath("$.owner.username").value("mario")).andExpect(jsonPath("$.owner.id").doesNotExist())
			.andExpect(jsonPath("$.expiresAt").exists());
		preview(bea, token).andExpect(status().isOk()); // peeking does not consume

		accept(bea, token).andExpect(status().isOk()).andExpect(jsonPath("$.id").value(id))
			.andExpect(jsonPath("$.role").value("AUTHOR"));
		mvc.perform(get("/api/cookbooks/mine").cookie(bea)).andExpect(jsonPath("$[0].id").value(id))
			.andExpect(jsonPath("$[0].role").value("AUTHOR"));
		mvc.perform(get("/api/cookbooks/" + id).cookie(owner)).andExpect(jsonPath("$.authors[0].username").value("bea1"))
			.andExpect(jsonPath("$.authors[0].id").value(userId("bea1").toString()));

		String recipe = data.publishedRecipe(bea, "PRIVATE");
		addRecipe(bea, id, recipe).andExpect(status().isCreated());
		mvc.perform(delete("/api/cookbooks/" + id + "/recipes/" + recipe).with(csrf()).cookie(bea))
			.andExpect(status().isNoContent());
		mvc.perform(patch("/api/cookbooks/" + id).with(csrf()).cookie(bea).contentType(MediaType.APPLICATION_JSON)
			.content("{\"name\":\"x\"}")).andExpect(status().isForbidden())
			.andExpect(jsonPath("$.code").value("cookbook_owner_only"));
		assertThat(jdbc.queryForObject("select count(*) from one_time_token where used_at is not null", Integer.class))
			.isEqualTo(1);
	}

	@Test
	void inviteIsSingleUseUnderConcurrency() throws Exception {
		String id = data.createCookbook(owner);
		String token = invite(owner, id)[1];
		List<Cookie> joiners = List.of(bea, carl);
		List<Integer> codes = Concurrently.run(2,
				i -> () -> accept(joiners.get(i), token).andReturn().getResponse().getStatus());
		assertThat(codes).containsExactlyInAnyOrder(200, 404);
		assertThat(jdbc.queryForObject("select count(*) from cookbook_author", Integer.class)).isEqualTo(1);
	}

	@Test
	void usedExpiredAndRevokedTokensAre404() throws Exception {
		String id = data.createCookbook(owner);
		String used = invite(owner, id)[1];
		accept(bea, used).andExpect(status().isOk());
		String expired = invite(owner, id)[1];
		jdbc.update("update one_time_token set expires_at = now() - interval '1 minute' where token_hash = ?",
				Tokens.hash(expired));
		String[] revoked = invite(owner, id);
		mvc.perform(delete("/api/cookbooks/" + id + "/invites/" + revoked[0]).with(csrf()).cookie(owner))
			.andExpect(status().isNoContent());

		for (String token : List.of(used, expired, revoked[1], Tokens.newToken())) {
			preview(carl, token).andExpect(status().isNotFound())
				.andExpect(jsonPath("$.code").value("cookbook_invite_invalid"));
			accept(carl, token).andExpect(status().isNotFound())
				.andExpect(jsonPath("$.code").value("cookbook_invite_invalid"));
		}
		assertThat(jdbc.queryForObject("select count(*) from cookbook_author", Integer.class)).isEqualTo(1);
		// revoking again, or a used/unknown one, is 404 too
		mvc.perform(delete("/api/cookbooks/" + id + "/invites/" + revoked[0]).with(csrf()).cookie(owner))
			.andExpect(status().isNotFound()).andExpect(jsonPath("$.code").value("cookbook_invite_invalid"));
		mvc.perform(delete("/api/cookbooks/" + id + "/invites/" + UUID.randomUUID()).with(csrf()).cookie(owner))
			.andExpect(status().isNotFound());
	}

	/** A fresh token of the given other purpose, made through the admin endpoint (the cookbook owner is an admin). */
	private String otherPurposeToken(String purpose) throws Exception {
		String path = purpose.equals("INSTANCE_INVITE") ? "/api/admin/invites"
				: "/api/admin/users/" + userId("bea1") + "/password-reset";
		String url = data.read(mvc.perform(post(path).with(csrf()).cookie(owner)).andExpect(status().isCreated())
			.andReturn()).get("url").asText();
		assertThat(jdbc.queryForObject("select purpose from one_time_token where token_hash = ?", String.class,
				Tokens.hash(url.substring(url.lastIndexOf('/') + 1)))).isEqualTo(purpose);
		return url.substring(url.lastIndexOf('/') + 1);
	}

	@ParameterizedTest
	@ValueSource(strings = { "INSTANCE_INVITE", "PASSWORD_RESET" })
	void otherPurposeTokensAreInvalidAsCookbookInvites(String purpose) throws Exception {
		data.createCookbook(owner);
		String token = otherPurposeToken(purpose);
		preview(carl, token).andExpect(status().isNotFound())
			.andExpect(jsonPath("$.code").value("cookbook_invite_invalid"));
		accept(carl, token).andExpect(status().isNotFound())
			.andExpect(jsonPath("$.code").value("cookbook_invite_invalid"));
		assertThat(jdbc.queryForObject("select count(*) from cookbook_author", Integer.class)).isZero();
		assertThat(jdbc.queryForObject("select count(*) from one_time_token where used_at is not null",
				Integer.class)).isZero();
	}

	@Test
	void cookbookInviteTokenIsInvalidAsInstanceInvite() throws Exception {
		String token = invite(owner, data.createCookbook(owner))[1];
		mvc.perform(get("/api/invites/" + token)).andExpect(status().isNotFound())
			.andExpect(jsonPath("$.code").value("invite_invalid"));
		mvc.perform(post("/api/invites/" + token + "/register").with(csrf()).contentType(MediaType.APPLICATION_JSON)
			.content("{\"email\":\"new@x.com\",\"password\":\"correct-horse-1\",\"username\":\"newbie\","
					+ "\"displayName\":\"New\"}"))
			.andExpect(status().isNotFound()).andExpect(jsonPath("$.code").value("invite_invalid"));
		assertThat(jdbc.queryForObject("select count(*) from app_user where username = 'newbie'", Integer.class))
			.isZero();
		preview(carl, token).andExpect(status().isOk()); // still a valid cookbook invite
	}

	@Test
	void anonymousAcceptIs401AndKeepsTheInvite() throws Exception {
		String token = invite(owner, data.createCookbook(owner))[1];
		mvc.perform(post("/api/cookbook-invites/" + token + "/accept").with(csrf()))
			.andExpect(status().isUnauthorized());
		assertThat(jdbc.queryForObject("select count(*) from one_time_token where used_at is not null",
				Integer.class)).isZero();
		accept(bea, token).andExpect(status().isOk());
	}

	@Test
	void revokingThroughAnotherCookbooksIdIs404() throws Exception {
		String first = data.createCookbook(owner);
		String second = data.createCookbook(owner);
		String[] inv = invite(owner, first);
		mvc.perform(delete("/api/cookbooks/" + second + "/invites/" + inv[0]).with(csrf()).cookie(owner))
			.andExpect(status().isNotFound()).andExpect(jsonPath("$.code").value("cookbook_invite_invalid"));
		preview(bea, inv[1]).andExpect(status().isOk()); // the invite of the first cookbook is untouched
		mvc.perform(delete("/api/cookbooks/" + first + "/invites/" + inv[0]).with(csrf()).cookie(owner))
			.andExpect(status().isNoContent());
	}

	@Test
	void alreadyMemberKeepsInvite() throws Exception {
		String id = data.createCookbook(owner);
		String token = invite(owner, id)[1];
		accept(owner, token).andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("already_member"));
		accept(carl, token).andExpect(status().isOk());
		String second = invite(owner, id)[1];
		accept(carl, second).andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("already_member"));
		accept(bea, second).andExpect(status().isOk());
	}

	@Test
	void authorsFullKeepsInvite() throws Exception {
		String id = data.createCookbook(owner);
		for (int i = 0; i < 20; i++) {
			data.account("a" + i + "@x.com", "author" + i, "A" + i, false);
			jdbc.update("insert into cookbook_author (cookbook_id, user_id, joined_at) values (?, ?, now())",
					UUID.fromString(id), userId("author" + i));
		}
		String token = invite(owner, id)[1];
		accept(bea, token).andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("cookbook_authors_full"));
		jdbc.update("delete from cookbook_author where user_id = ?", userId("author0"));
		accept(bea, token).andExpect(status().isOk());
	}

	@Test
	void onlyTheOwnerManagesInvites() throws Exception {
		String id = data.createCookbook(owner);
		join(id, bea);
		String[] inv = invite(owner, id);
		mvc.perform(post("/api/cookbooks/" + id + "/invites").with(csrf()).cookie(bea)).andExpect(status().isForbidden());
		mvc.perform(get("/api/cookbooks/" + id + "/invites").cookie(bea)).andExpect(status().isForbidden());
		mvc.perform(delete("/api/cookbooks/" + id + "/invites/" + inv[0]).with(csrf()).cookie(bea))
			.andExpect(status().isForbidden());
		mvc.perform(post("/api/cookbooks/" + id + "/invites").with(csrf()).cookie(carl)).andExpect(status().isNotFound())
			.andExpect(jsonPath("$.code").value("cookbook_not_found"));
		mvc.perform(get("/api/cookbooks/" + id + "/invites").cookie(carl)).andExpect(status().isNotFound());
		mvc.perform(delete("/api/cookbooks/" + id + "/invites/" + inv[0]).with(csrf()).cookie(carl))
			.andExpect(status().isNotFound());
		mvc.perform(post("/api/cookbooks/" + id + "/invites").with(csrf())).andExpect(status().isUnauthorized());
		mvc.perform(get("/api/cookbook-invites/" + inv[1])).andExpect(status().isUnauthorized());
		preview(carl, inv[1]).andExpect(status().isOk()); // revoke by a non-owner changed nothing
	}

	@Test
	void listShowsOutstandingOnlyAndCapIs20() throws Exception {
		String id = data.createCookbook(owner);
		String[] first = invite(owner, id);
		accept(bea, first[1]).andExpect(status().isOk());
		String[] second = invite(owner, id);
		mvc.perform(get("/api/cookbooks/" + id + "/invites").cookie(owner)).andExpect(jsonPath("$.length()").value(1))
			.andExpect(jsonPath("$[0].id").value(second[0])).andExpect(jsonPath("$[0].url").doesNotExist())
			.andExpect(jsonPath("$[0].expiresAt").exists());
		for (int i = 1; i < 20; i++) {
			invite(owner, id);
		}
		mvc.perform(post("/api/cookbooks/" + id + "/invites").with(csrf()).cookie(owner)).andExpect(status().isConflict())
			.andExpect(jsonPath("$.code").value("cookbook_invites_full"));
		mvc.perform(delete("/api/cookbooks/" + id + "/invites/" + second[0]).with(csrf()).cookie(owner))
			.andExpect(status().isNoContent());
		invite(owner, id);
	}

	@Test
	void tokenIsHashedAndDeletingTheCookbookDeletesItsInvites() throws Exception {
		String id = data.createCookbook(owner);
		String[] inv = invite(owner, id);
		assertThat(jdbc.queryForObject("select token_hash from one_time_token", String.class))
			.isEqualTo(Tokens.hash(inv[1]));
		assertThat(jdbc.queryForObject("select purpose from one_time_token", String.class)).isEqualTo("COOKBOOK_INVITE");
		mvc.perform(delete("/api/cookbooks/" + id).with(csrf()).cookie(owner)).andExpect(status().isNoContent());
		assertThat(jdbc.queryForObject("select count(*) from one_time_token", Integer.class)).isZero();
		preview(bea, inv[1]).andExpect(status().isNotFound());
	}
}

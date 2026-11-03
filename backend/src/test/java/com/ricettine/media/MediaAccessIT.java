package com.ricettine.media;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.ricettine.IntegrationTest;
import com.ricettine.Sessions;
import com.ricettine.account.AccountDtos.NewAccountRequest;
import com.ricettine.account.AccountService;
import com.ricettine.account.User;
import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.ResultSet;
import java.sql.Statement;
import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;
import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;

class MediaAccessIT extends IntegrationTest {

	@Autowired JdbcTemplate jdbc;
	@Autowired AccountService accounts;
	@Autowired MediaService media;

	User owner;

	@BeforeEach
	void setUp() {
		jdbc.execute("truncate table app_user, one_time_token, instance_setup cascade");
		owner = accounts.create(new NewAccountRequest("o@x.com", Sessions.PASSWORD, "owner", "Owner"), true);
	}

	@Test
	void avatarIsServedAnonymouslyWithImmutableHeaderAndHasARow() throws Exception {
		String id = media.register(media.process(TestImages.orientation6(), Set.of(ImageVariant.AVATAR)), owner.getId(), MediaKind.AVATAR, null);
		assertThat(jdbc.queryForObject("select kind from media where id = ? and owner_id = ?", String.class, id,
				owner.getId())).isEqualTo("AVATAR");
		mvc.perform(get(media.url(id, ImageVariant.AVATAR))).andExpect(status().isOk())
				.andExpect(header().string("Cache-Control", "public, max-age=31536000, immutable"));
	}

	@Test
	void recipeKindWithoutPolicyIs404ForEveryone() throws Exception {
		String id = media.register(media.process(TestImages.orientation6(), Set.of(ImageVariant.THUMB)), owner.getId(), MediaKind.RECIPE, null);
		mvc.perform(get(media.url(id, ImageVariant.THUMB))).andExpect(status().isNotFound());
		var cookie = Sessions.login(mvc, "o@x.com");
		mvc.perform(get(media.url(id, ImageVariant.THUMB)).cookie(cookie)).andExpect(status().isNotFound());
	}

	@Test
	void blobWithoutRowIs404() throws Exception {
		String id = media.register(media.process(TestImages.orientation6(), Set.of(ImageVariant.AVATAR)), owner.getId(), MediaKind.AVATAR, null);
		jdbc.update("delete from media where id = ?", id);
		mvc.perform(get(media.url(id, ImageVariant.AVATAR))).andExpect(status().isNotFound());
	}

	@Test
	void deleteRemovesRowAndBlobs() throws Exception {
		String id = media.register(media.process(TestImages.orientation6(), Set.of(ImageVariant.AVATAR)), owner.getId(), MediaKind.AVATAR, null);
		media.delete(id);
		assertThat(jdbc.queryForObject("select count(*) from media", Integer.class)).isZero();
		mvc.perform(get(media.url(id, ImageVariant.AVATAR))).andExpect(status().isNotFound());
	}

	@Test
	void twoPoliciesForOneKindFailFast() {
		MediaAccessPolicy p = new MediaAccessPolicy() {
			public MediaKind kind() { return MediaKind.AVATAR; }
			public Optional<String> cacheControl(Media m, jakarta.servlet.http.HttpServletRequest req) { return Optional.empty(); }
		};
		assertThatThrownBy(() -> MediaController.policiesByKind(List.of(p, new AvatarAccessPolicy())))
				.isInstanceOf(IllegalStateException.class).hasMessageContaining("AVATAR");
	}

	/** Runs the real V3 INSERT...SELECT: migrate a scratch schema to V2, add a user with an avatar, migrate to V3. */
	@Test
	void migrationBackfillsExistingAvatarKeys() throws Exception {
		String url = postgres.getJdbcUrl();
		try (Connection c = DriverManager.getConnection(url, postgres.getUsername(), postgres.getPassword());
				Statement s = c.createStatement()) {
			s.execute("drop schema if exists backfill_test cascade");
		}
		var cfg = Flyway.configure().dataSource(url, postgres.getUsername(), postgres.getPassword())
				.schemas("backfill_test").locations("classpath:db/migration");
		cfg.target("2").load().migrate();
		UUID uid = UUID.randomUUID();
		UUID noAvatar = UUID.randomUUID();
		try (Connection c = DriverManager.getConnection(url, postgres.getUsername(), postgres.getPassword());
				Statement s = c.createStatement()) {
			s.execute("insert into backfill_test.app_user(id,email,username,display_name,password_hash,avatar_key,created_at) "
					+ "values ('%s','a@x.com','a','A','h','old-avatar-key', now()), ('%s','b@x.com','b','B','h',null, now())"
							.formatted(uid, noAvatar));
		}
		cfg.target("3").load().migrate();
		try (Connection c = DriverManager.getConnection(url, postgres.getUsername(), postgres.getPassword());
				Statement s = c.createStatement();
				ResultSet rs = s.executeQuery("select id, owner_id, kind, recipe_id, created_at from backfill_test.media")) {
			assertThat(rs.next()).isTrue();
			assertThat(rs.getString("id")).isEqualTo("old-avatar-key");
			assertThat(rs.getObject("owner_id", UUID.class)).isEqualTo(uid);
			assertThat(rs.getString("kind")).isEqualTo("AVATAR");
			assertThat(rs.getObject("recipe_id")).isNull();
			assertThat(rs.getTimestamp("created_at").toInstant()).isBefore(Instant.now().plusSeconds(60));
			assertThat(rs.next()).isFalse();
		}
		try (Connection c = DriverManager.getConnection(url, postgres.getUsername(), postgres.getPassword());
				Statement s = c.createStatement()) {
			s.execute("drop schema backfill_test cascade");
		}
	}
}

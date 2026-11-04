package com.ricettine.feed;

import com.ricettine.common.ApiException;
import com.ricettine.feed.FeedDtos.FeedItem;
import com.ricettine.feed.FeedDtos.FeedPage;
import com.ricettine.media.ImageVariant;
import com.ricettine.media.MediaService;
import com.ricettine.recipe.RecipeDtos.AuthorDto;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
class FeedService {

	static final int MAX_LIMIT = 50;

	private final JdbcTemplate jdbc;
	private final MediaService media;

	FeedService(JdbcTemplate jdbc, MediaService media) {
		this.jdbc = jdbc;
		this.media = media;
	}

	@Transactional(readOnly = true)
	FeedPage page(String cursor, int limit) {
		if (limit < 1 || limit > MAX_LIMIT) {
			throw invalid("limit");
		}
		FeedCursor.Key key = null;
		if (cursor != null) {
			key = FeedCursor.decode(cursor).orElseThrow(() -> invalid("cursor"));
		}
		// The listing rule: only PUBLISHED + PUBLIC recipes, never drafts.
		StringBuilder sql = new StringBuilder("""
			select r.id, r.title, r.share_token, r.cover_media_id, r.published_at,
			       u.username, u.display_name, u.avatar_key
			from recipe r join app_user u on u.id = r.author_id
			where r.status = 'PUBLISHED' and r.visibility = 'PUBLIC' and r.published_at is not null
			""");
		java.util.ArrayList<Object> args = new java.util.ArrayList<>();
		if (key != null) {
			sql.append(" and (r.published_at, r.id) < (?, ?)");
			args.add(Timestamp.from(key.at()));
			args.add(key.id());
		}
		sql.append(" order by r.published_at desc, r.id desc limit ?");
		args.add(limit + 1);

		List<FeedItem> rows = jdbc.query(sql.toString(), (rs, n) -> {
			String token = rs.getString("share_token");
			String cover = rs.getString("cover_media_id");
			String avatar = rs.getString("avatar_key");
			return new FeedItem(rs.getObject("id", UUID.class), rs.getString("title"),
					new AuthorDto(rs.getString("username"), rs.getString("display_name"),
							avatar == null ? null : media.url(avatar, ImageVariant.AVATAR)),
					token,
					cover == null ? null : media.url(cover, ImageVariant.THUMB) + "?s="
							+ URLEncoder.encode(token, StandardCharsets.UTF_8),
					rs.getTimestamp("published_at").toInstant());
		}, args.toArray());

		if (rows.size() <= limit) {
			return new FeedPage(rows, null);
		}
		List<FeedItem> items = rows.subList(0, limit);
		FeedItem last = items.get(limit - 1);
		return new FeedPage(List.copyOf(items), FeedCursor.encode(last.publishedAt(), last.id()));
	}

	private static ApiException invalid(String field) {
		return new ApiException(HttpStatus.BAD_REQUEST, "validation_failed", Map.of(field, "invalid"));
	}
}

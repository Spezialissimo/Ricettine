package com.ricettine.feed;

import com.ricettine.recipe.RecipeDtos.AuthorDto;
import java.time.Instant;
import java.util.List;
import java.util.UUID;

public final class FeedDtos {

	private FeedDtos() {
	}

	public record FeedItem(UUID id, String title, AuthorDto author, String shareToken, String coverThumbUrl,
			Instant publishedAt) {
	}

	public record FeedPage(List<FeedItem> items, String nextCursor) {
	}
}

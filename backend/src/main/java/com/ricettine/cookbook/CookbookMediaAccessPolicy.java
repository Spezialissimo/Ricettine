package com.ricettine.cookbook;

import com.ricettine.auth.CurrentUser;
import com.ricettine.media.Media;
import com.ricettine.media.MediaAccessPolicy;
import com.ricettine.media.MediaKind;
import jakarta.servlet.http.HttpServletRequest;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.Optional;
import java.util.UUID;
import org.springframework.stereotype.Component;

/**
 * Cookbook covers: readable by the cookbook's members with their session, or by anyone holding the cookbook's
 * current token ({@code ?c=}). Everything else is denied (the media controller answers 404).
 */
@Component
class CookbookMediaAccessPolicy implements MediaAccessPolicy {

	/** Members revalidate too: a removed co-author must lose the cover at once, and the 304 is cheap. */
	static final String CACHE = "private, no-cache";
	/** Token holders must revalidate, so a link reset takes effect at once. */
	static final String TOKEN_CACHE = "private, no-cache";

	private final CurrentUser currentUser;
	private final CookbookRepository cookbooks;
	private final CookbookAuthorRepository authors;

	CookbookMediaAccessPolicy(CurrentUser currentUser, CookbookRepository cookbooks,
			CookbookAuthorRepository authors) {
		this.currentUser = currentUser;
		this.cookbooks = cookbooks;
		this.authors = authors;
	}

	@Override
	public MediaKind kind() {
		return MediaKind.COOKBOOK;
	}

	@Override
	public Optional<String> cacheControl(Media m, HttpServletRequest req) {
		UUID cookbookId = m.getCookbookId();
		if (cookbookId == null) {
			return Optional.empty();
		}
		Cookbook c = cookbooks.findById(cookbookId).filter(cb -> m.getId().equals(cb.getCoverMediaId())).orElse(null);
		if (c == null) {
			return Optional.empty();
		}
		UUID viewer = currentUser.optionalId().orElse(null);
		if (viewer != null && (c.getOwnerId().equals(viewer) || authors.existsByCookbookIdAndUserId(cookbookId, viewer))) {
			return Optional.of(CACHE);
		}
		String token = req.getParameter("c");
		if (token != null && !token.isEmpty() && MessageDigest.isEqual(
				c.getShareToken().getBytes(StandardCharsets.UTF_8), token.getBytes(StandardCharsets.UTF_8))) {
			return Optional.of(TOKEN_CACHE);
		}
		return Optional.empty();
	}
}

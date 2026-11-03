package com.ricettine.recipe;

import com.ricettine.auth.CurrentUser;
import com.ricettine.media.Media;
import com.ricettine.media.MediaAccessPolicy;
import com.ricettine.media.MediaKind;
import jakarta.servlet.http.HttpServletRequest;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.Optional;
import org.springframework.stereotype.Component;

/**
 * Recipe photos: readable by their owner, or by anyone holding the recipe's share token ({@code ?s=}) while the
 * recipe is published. Everything else is denied (the media controller answers 404).
 */
@Component
public class RecipeMediaAccessPolicy implements MediaAccessPolicy {

	static final String CACHE = "private, max-age=3600";

	private final CurrentUser currentUser;
	private final RecipeRepository recipes;

	public RecipeMediaAccessPolicy(CurrentUser currentUser, RecipeRepository recipes) {
		this.currentUser = currentUser;
		this.recipes = recipes;
	}

	@Override
	public MediaKind kind() {
		return MediaKind.RECIPE;
	}

	@Override
	public Optional<String> cacheControl(Media m, HttpServletRequest req) {
		if (currentUser.optionalId().filter(id -> id.equals(m.getOwnerId())).isPresent()) {
			return Optional.of(CACHE);
		}
		String s = req.getParameter("s");
		if (s == null || s.isEmpty() || m.getRecipeId() == null) {
			return Optional.empty();
		}
		return recipes.publishedShareToken(m.getRecipeId())
			.filter(token -> MessageDigest.isEqual(token.getBytes(StandardCharsets.UTF_8),
					s.getBytes(StandardCharsets.UTF_8)))
			.map(token -> CACHE);
	}
}

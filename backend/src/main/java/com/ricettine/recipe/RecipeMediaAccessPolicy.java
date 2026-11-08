package com.ricettine.recipe;

import com.ricettine.auth.CurrentUser;
import com.ricettine.media.Media;
import com.ricettine.media.MediaAccessPolicy;
import com.ricettine.media.MediaKind;
import jakarta.servlet.http.HttpServletRequest;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.stereotype.Component;

/**
 * Recipe photos: readable by their owner, or by anyone holding the recipe's share token ({@code ?s=}) while the
 * recipe is published. Everything else is denied (the media controller answers 404).
 */
@Component
public class RecipeMediaAccessPolicy implements MediaAccessPolicy {

	static final String CACHE = "private, max-age=3600";
	/** Token holders must revalidate, so a link reset takes effect at once. */
	static final String TOKEN_CACHE = "private, no-cache";

	private final CurrentUser currentUser;
	private final RecipeRepository recipes;
	private final List<RecipeReadGrant> grants;

	public RecipeMediaAccessPolicy(CurrentUser currentUser, RecipeRepository recipes, List<RecipeReadGrant> grants) {
		this.currentUser = currentUser;
		this.recipes = recipes;
		this.grants = grants;
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
		UUID recipeId = m.getRecipeId();
		if (recipeId == null) {
			return Optional.empty();
		}
		String s = req.getParameter("s");
		if (s != null && !s.isEmpty() && recipes.publishedShareToken(recipeId).filter(s::equals).isPresent()) {
			return Optional.of(TOKEN_CACHE);
		}
		return grants.stream().anyMatch(g -> g.grants(recipeId, req)) ? Optional.of(TOKEN_CACHE) : Optional.empty();
	}
}

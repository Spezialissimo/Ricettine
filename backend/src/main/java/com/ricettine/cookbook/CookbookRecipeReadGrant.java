package com.ricettine.cookbook;

import com.ricettine.recipe.RecipeReadGrant;
import jakarta.servlet.http.HttpServletRequest;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.UUID;
import org.springframework.stereotype.Component;

/** {@code ?c=}: a current cookbook token opens the photos of the PUBLISHED recipes that are entries of that cookbook. */
@Component
class CookbookRecipeReadGrant implements RecipeReadGrant {

	private final CookbookEntryRepository entries;

	CookbookRecipeReadGrant(CookbookEntryRepository entries) {
		this.entries = entries;
	}

	@Override
	public boolean grants(UUID recipeId, HttpServletRequest req) {
		String c = req.getParameter("c");
		if (c == null || c.isEmpty() || recipeId == null) {
			return false;
		}
		return entries.grantingToken(c, recipeId)
			.filter(t -> MessageDigest.isEqual(t.getBytes(StandardCharsets.UTF_8), c.getBytes(StandardCharsets.UTF_8)))
			.isPresent();
	}
}

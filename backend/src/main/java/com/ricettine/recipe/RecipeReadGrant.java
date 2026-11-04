package com.ricettine.recipe;

import jakarta.servlet.http.HttpServletRequest;
import java.util.UUID;

/** An extra way to read a recipe's photos (e.g. through a cookbook link); grants answer {@code private, no-cache}. */
public interface RecipeReadGrant {

	boolean grants(UUID recipeId, HttpServletRequest req);
}

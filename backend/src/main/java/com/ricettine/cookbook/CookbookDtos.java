package com.ricettine.cookbook;

import com.ricettine.recipe.RecipeDtos.PhotoDto;
import java.time.Instant;
import java.util.List;
import java.util.UUID;

public final class CookbookDtos {

	private CookbookDtos() {
	}

	/** A user as shown in a cookbook; the whole object is null when the person deleted their account. */
	public record PersonDto(String username, String displayName, String avatarUrl) {
	}

	public record CookbookSummary(UUID id, String name, String visibility, String role, int recipeCount,
			String coverThumbUrl, Instant updatedAt) {
	}

	public record CookbookEntryDto(UUID recipeId, String title, PersonDto author, PersonDto addedBy,
			Instant addedAt, boolean mine, String coverThumbUrl) {
	}

	public record CookbookDto(UUID id, String name, String description, String visibility, String role,
			PersonDto owner, List<PersonDto> authors, String shareUrl, PhotoDto cover,
			List<CookbookEntryDto> recipes, Instant updatedAt) {
	}

	/** Create and patch body; on patch a null field means unchanged. */
	public record CookbookInput(String name, String description, String visibility) {
	}

	/** Exactly one of the two must be set. */
	public record RecipeRef(UUID recipeId, String shareToken) {
	}
}

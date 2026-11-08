package com.ricettine.cookbook;

import com.fasterxml.jackson.annotation.JsonInclude;
import com.ricettine.recipe.RecipeDtos.PhotoDto;
import java.time.Instant;
import java.util.List;
import java.util.UUID;

public final class CookbookDtos {

	private CookbookDtos() {
	}

	/** A user as shown in a cookbook; the whole object is null when the person deleted their account. */
	public record PersonDto(@JsonInclude(JsonInclude.Include.NON_NULL) UUID id, String username,
			String displayName, String avatarUrl) {
	}

	public record CookbookInviteCreated(UUID id, String url, Instant expiresAt) {
	}

	public record CookbookInviteDto(UUID id, Instant createdAt, Instant expiresAt) {
	}

	public record CookbookInvitePreview(String cookbookName, PersonDto owner, Instant expiresAt) {
	}

	public record CookbookSummary(UUID id, String name, String visibility, String role, int recipeCount,
			String coverThumbUrl, Instant updatedAt) {
	}

	public record ProfileCookbook(UUID id, String name, String visibility, int recipeCount, String shareToken,
			String coverThumbUrl) {
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

	public record PublicCookbookEntry(UUID recipeId, String title, PersonDto author, String coverThumbUrl) {
	}

	/** Anonymous cookbook view; viewerRole is OWNER / AUTHOR for members, else null, and cookbookId is members-only. */
	public record PublicCookbook(String name, String description, PersonDto owner, List<PersonDto> authors,
			PhotoDto cover, List<PublicCookbookEntry> recipes, String viewerRole,
			@JsonInclude(JsonInclude.Include.NON_NULL) UUID cookbookId) {
	}
}

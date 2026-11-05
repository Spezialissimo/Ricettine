package com.ricettine.recipe;

import com.fasterxml.jackson.annotation.JsonInclude;
import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;
import java.util.UUID;

public final class RecipeDtos {

	private RecipeDtos() {
	}

	public record IngredientDto(BigDecimal amount, String unit, String name, String note) {
	}

	public record GroupDto(String name, List<IngredientDto> ingredients) {
	}

	public record PhotoDto(String mediaId, String thumbUrl, String displayUrl) {
	}

	public record StepDto(String text, PhotoDto photo) {
	}

	public record RecipeDto(UUID id, String status, String visibility, String title, int portions,
			Integer prepMinutes, Integer cookMinutes, String source, String notes, PhotoDto cover,
			List<GroupDto> groups, List<StepDto> steps, long version, String shareUrl, Instant createdAt,
			Instant updatedAt, Instant publishedAt) {
	}

	public record AuthorDto(String username, String displayName, String avatarUrl) {
	}

	public record PublicStepDto(String text, PhotoDto photo) {
	}

	public record PublicRecipe(String title, AuthorDto author, int portions, Integer prepMinutes,
			Integer cookMinutes, String source, String notes, PhotoDto cover, List<GroupDto> groups,
			List<PublicStepDto> steps, Instant publishedAt, boolean viewerIsAuthor,
			@JsonInclude(JsonInclude.Include.NON_NULL) UUID recipeId,
			@JsonInclude(JsonInclude.Include.NON_NULL) String cookbookName) {
	}

	public record StepInput(String text, String photoMediaId) {
	}

	public record RecipeInput(Long version, String title, int portions, Integer prepMinutes, Integer cookMinutes,
			String source, String notes, String visibility, String coverMediaId, List<GroupDto> groups,
			List<StepInput> steps) {
	}

	public record RecipeSummary(UUID id, String title, String status, String visibility, String coverThumbUrl,
			Instant updatedAt) {
	}

	public record PublishRequest(Long version) {
	}
}

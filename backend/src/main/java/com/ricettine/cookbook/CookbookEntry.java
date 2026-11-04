package com.ricettine.cookbook;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.IdClass;
import jakarta.persistence.Table;
import java.io.Serializable;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.UUID;

/** A recipe in a cookbook. {@code addedBy} is null once the adder deleted their account. */
@Entity
@Table(name = "cookbook_entry")
@IdClass(CookbookEntry.Key.class)
public class CookbookEntry {

	public record Key(UUID cookbookId, UUID recipeId) implements Serializable {
	}

	@Id
	@Column(name = "cookbook_id")
	private UUID cookbookId;
	@Id
	@Column(name = "recipe_id")
	private UUID recipeId;
	@Column(name = "added_by")
	private UUID addedBy;
	@Column(name = "added_at")
	private Instant addedAt;

	protected CookbookEntry() {
	}

	public CookbookEntry(UUID cookbookId, UUID recipeId, UUID addedBy) {
		this.cookbookId = cookbookId;
		this.recipeId = recipeId;
		this.addedBy = addedBy;
		this.addedAt = Instant.now().truncatedTo(ChronoUnit.MICROS);
	}

	public UUID getCookbookId() { return cookbookId; }
	public UUID getRecipeId() { return recipeId; }
	public UUID getAddedBy() { return addedBy; }
	public Instant getAddedAt() { return addedAt; }
}

package com.ricettine.media;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Id;
import jakarta.persistence.PostLoad;
import jakarta.persistence.PostPersist;
import jakarta.persistence.Table;
import jakarta.persistence.Transient;
import java.time.Instant;
import java.util.UUID;
import org.springframework.data.domain.Persistable;

/** Registry row for one stored image (all its variants): who owns it and what it is for. */
@Entity
@Table(name = "media")
public class Media implements Persistable<String> {

	@Id
	private String id;
	@Column(name = "owner_id")
	private UUID ownerId;
	@Enumerated(EnumType.STRING)
	private MediaKind kind;
	@Column(name = "recipe_id")
	private UUID recipeId;
	@Column(name = "created_at")
	private Instant createdAt;
	@Transient
	private boolean isNew = true;

	protected Media() {
	}

	public Media(String id, UUID ownerId, MediaKind kind, UUID recipeId) {
		this.id = id;
		this.ownerId = ownerId;
		this.kind = kind;
		this.recipeId = recipeId;
		this.createdAt = Instant.now();
	}

	@PostLoad
	@PostPersist
	void markNotNew() {
		this.isNew = false;
	}

	@Override
	public String getId() { return id; }
	@Override
	public boolean isNew() { return isNew; }
	public UUID getOwnerId() { return ownerId; }
	public MediaKind getKind() { return kind; }
	public UUID getRecipeId() { return recipeId; }
	public Instant getCreatedAt() { return createdAt; }
}

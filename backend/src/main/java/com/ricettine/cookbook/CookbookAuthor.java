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

/** A co-author of a cookbook (the owner is not a row here). */
@Entity
@Table(name = "cookbook_author")
@IdClass(CookbookAuthor.Key.class)
public class CookbookAuthor {

	public record Key(UUID cookbookId, UUID userId) implements Serializable {
	}

	@Id
	@Column(name = "cookbook_id")
	private UUID cookbookId;
	@Id
	@Column(name = "user_id")
	private UUID userId;
	@Column(name = "joined_at")
	private Instant joinedAt;

	protected CookbookAuthor() {
	}

	public CookbookAuthor(UUID cookbookId, UUID userId) {
		this.cookbookId = cookbookId;
		this.userId = userId;
		this.joinedAt = Instant.now().truncatedTo(ChronoUnit.MICROS);
	}

	public UUID getCookbookId() { return cookbookId; }
	public UUID getUserId() { return userId; }
	public Instant getJoinedAt() { return joinedAt; }
}

package com.ricettine.cookbook;

import com.ricettine.recipe.Visibility;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.UUID;

/** A cookbook. Not versioned: metadata edits are last-write-wins. */
@Entity
@Table(name = "cookbook")
public class Cookbook {

	@Id
	@GeneratedValue(strategy = GenerationType.UUID)
	private UUID id;
	@Column(name = "owner_id")
	private UUID ownerId;
	private String name;
	private String description;
	@Enumerated(EnumType.STRING)
	private Visibility visibility;
	@Column(name = "share_token")
	private String shareToken;
	@Column(name = "cover_media_id")
	private String coverMediaId;
	@Column(name = "created_at")
	private Instant createdAt;
	@Column(name = "updated_at")
	private Instant updatedAt;

	protected Cookbook() {
	}

	public static Cookbook create(UUID ownerId, String name, String description, Visibility visibility,
			String shareToken) {
		Cookbook c = new Cookbook();
		c.ownerId = ownerId;
		c.name = name;
		c.description = description;
		c.visibility = visibility;
		c.shareToken = shareToken;
		c.createdAt = Instant.now().truncatedTo(ChronoUnit.MICROS);
		c.updatedAt = c.createdAt;
		return c;
	}

	public void touch() {
		Instant now = Instant.now().truncatedTo(ChronoUnit.MICROS);
		this.updatedAt = now.isAfter(updatedAt) ? now : updatedAt.plus(1, ChronoUnit.MICROS);
	}

	public void setName(String name) { this.name = name; }
	public void setDescription(String description) { this.description = description; }
	public void setVisibility(Visibility visibility) { this.visibility = visibility; }
	public void resetShareToken(String token) { this.shareToken = token; }

	public void setCoverMediaId(String coverMediaId) { this.coverMediaId = coverMediaId; }

	public UUID getId() { return id; }
	public UUID getOwnerId() { return ownerId; }
	public String getName() { return name; }
	public String getDescription() { return description; }
	public Visibility getVisibility() { return visibility; }
	public String getShareToken() { return shareToken; }
	public String getCoverMediaId() { return coverMediaId; }
	public Instant getCreatedAt() { return createdAt; }
	public Instant getUpdatedAt() { return updatedAt; }
}

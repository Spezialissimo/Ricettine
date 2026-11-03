package com.ricettine.recipe;

import jakarta.persistence.CascadeType;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.OneToMany;
import jakarta.persistence.OrderBy;
import jakarta.persistence.Table;
import jakarta.persistence.Version;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

/**
 * A recipe document. {@code version} is the optimistic-lock counter: it is also the client-visible document
 * version, and increments on every successful save.
 */
@Entity
@Table(name = "recipe")
public class Recipe {

	@Id
	@GeneratedValue(strategy = GenerationType.UUID)
	private UUID id;
	@Column(name = "author_id")
	private UUID authorId;
	@Enumerated(EnumType.STRING)
	private RecipeStatus status;
	@Enumerated(EnumType.STRING)
	private Visibility visibility;
	private String title;
	private int portions;
	@Column(name = "prep_minutes")
	private Integer prepMinutes;
	@Column(name = "cook_minutes")
	private Integer cookMinutes;
	private String source;
	private String notes;
	@Column(name = "cover_media_id")
	private String coverMediaId;
	@Column(name = "share_token")
	private String shareToken;
	@Version
	private Long version;
	@Column(name = "created_at")
	private Instant createdAt;
	@Column(name = "updated_at")
	private Instant updatedAt;
	@Column(name = "published_at")
	private Instant publishedAt;
	@OneToMany(cascade = CascadeType.ALL, orphanRemoval = true)
	@JoinColumn(name = "recipe_id", nullable = false)
	@OrderBy("position")
	private List<IngredientGroup> groups = new ArrayList<>();
	@OneToMany(cascade = CascadeType.ALL, orphanRemoval = true)
	@JoinColumn(name = "recipe_id", nullable = false)
	@OrderBy("position")
	private List<Step> steps = new ArrayList<>();

	protected Recipe() {
	}

	public static Recipe newDraft(UUID authorId, String shareToken) {
		Recipe r = new Recipe();
		r.authorId = authorId;
		r.status = RecipeStatus.DRAFT;
		r.visibility = Visibility.PRIVATE;
		r.portions = 1;
		r.shareToken = shareToken;
		r.createdAt = Instant.now();
		r.updatedAt = r.createdAt;
		return r;
	}

	public void touch() { this.updatedAt = Instant.now(); }

	public void setTitle(String title) { this.title = title; }
	public void setPortions(int portions) { this.portions = portions; }
	public void setPrepMinutes(Integer prepMinutes) { this.prepMinutes = prepMinutes; }
	public void setCookMinutes(Integer cookMinutes) { this.cookMinutes = cookMinutes; }
	public void setSource(String source) { this.source = source; }
	public void setNotes(String notes) { this.notes = notes; }
	public void setVisibility(Visibility visibility) { this.visibility = visibility; }
	public void setCoverMediaId(String coverMediaId) { this.coverMediaId = coverMediaId; }

	public void publish() {
		this.status = RecipeStatus.PUBLISHED;
		if (this.publishedAt == null) {
			this.publishedAt = Instant.now();
		}
	}

	public UUID getId() { return id; }
	public UUID getAuthorId() { return authorId; }
	public RecipeStatus getStatus() { return status; }
	public Visibility getVisibility() { return visibility; }
	public String getTitle() { return title; }
	public int getPortions() { return portions; }
	public Integer getPrepMinutes() { return prepMinutes; }
	public Integer getCookMinutes() { return cookMinutes; }
	public String getSource() { return source; }
	public String getNotes() { return notes; }
	public String getCoverMediaId() { return coverMediaId; }
	public String getShareToken() { return shareToken; }
	public long getVersion() { return version == null ? 0 : version; }
	public Instant getCreatedAt() { return createdAt; }
	public Instant getUpdatedAt() { return updatedAt; }
	public Instant getPublishedAt() { return publishedAt; }
	public List<IngredientGroup> getGroups() { return groups; }
	public List<Step> getSteps() { return steps; }
}

package com.ricettine.common;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.Instant;
import java.util.UUID;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

@Entity
@Table(name = "one_time_token")
public class OneTimeToken {

	@Id
	private UUID id;
	private String purpose;
	@Column(name = "token_hash", length = 64)
	@JdbcTypeCode(SqlTypes.CHAR)
	private String tokenHash;
	@Column(name = "user_id")
	private UUID userId;
	@Column(name = "created_by")
	private UUID createdBy;
	@Column(name = "expires_at")
	private Instant expiresAt;
	@Column(name = "used_at")
	private Instant usedAt;
	@Column(name = "revoked_at")
	private Instant revokedAt;
	@Column(name = "created_at")
	private Instant createdAt;

	protected OneTimeToken() {
	}

	public OneTimeToken(String purpose, String tokenHash, UUID userId, UUID createdBy, Instant expiresAt) {
		this.id = UUID.randomUUID();
		this.purpose = purpose;
		this.tokenHash = tokenHash;
		this.userId = userId;
		this.createdBy = createdBy;
		this.expiresAt = expiresAt;
		this.createdAt = Instant.now();
	}

	public UUID getId() { return id; }
	public String getPurpose() { return purpose; }
	public String getTokenHash() { return tokenHash; }
	public UUID getUserId() { return userId; }
	public UUID getCreatedBy() { return createdBy; }
	public Instant getExpiresAt() { return expiresAt; }
	public Instant getUsedAt() { return usedAt; }
	public Instant getRevokedAt() { return revokedAt; }
	public Instant getCreatedAt() { return createdAt; }
}

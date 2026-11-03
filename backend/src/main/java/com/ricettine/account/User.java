package com.ricettine.account;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "app_user")
public class User {

	@Id
	private UUID id;
	private String email;
	private String username;
	@Column(name = "display_name")
	private String displayName;
	@Column(name = "password_hash")
	private String passwordHash;
	@Column(name = "is_admin")
	private boolean admin;
	@Column(name = "avatar_key")
	private String avatarKey;
	@Column(name = "created_at")
	private Instant createdAt;

	protected User() {
	}

	public User(String email, String username, String displayName, String passwordHash, boolean admin) {
		this.id = UUID.randomUUID();
		this.email = email;
		this.username = username;
		this.displayName = displayName;
		this.passwordHash = passwordHash;
		this.admin = admin;
		this.createdAt = Instant.now();
	}

	public UUID getId() { return id; }
	public String getEmail() { return email; }
	public String getUsername() { return username; }
	public String getDisplayName() { return displayName; }
	public String getPasswordHash() { return passwordHash; }
	public boolean isAdmin() { return admin; }
	public String getAvatarKey() { return avatarKey; }
	public Instant getCreatedAt() { return createdAt; }
}

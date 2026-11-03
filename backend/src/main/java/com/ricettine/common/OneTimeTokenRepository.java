package com.ricettine.common;

import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;

public interface OneTimeTokenRepository extends JpaRepository<OneTimeToken, UUID> {

	@Query(value = "select * from one_time_token where token_hash = :hash and purpose = :purpose "
			+ "and used_at is null and revoked_at is null and expires_at > now()", nativeQuery = true)
	Optional<OneTimeToken> findActive(String hash, String purpose);

	@Query(value = "select * from one_time_token where purpose = :purpose and used_at is null "
			+ "and revoked_at is null and expires_at > now() order by created_at desc", nativeQuery = true)
	List<OneTimeToken> listActive(String purpose);

	@Modifying
	@Query(value = "update one_time_token set revoked_at = now() where id = :id and purpose = :purpose "
			+ "and revoked_at is null", nativeQuery = true)
	int revoke(UUID id, String purpose);

	/** Revokes every outstanding (unused, unrevoked) token of the purpose that belongs to {@code userId}. */
	@Modifying
	@Query(value = "update one_time_token set revoked_at = now() where user_id = :userId and purpose = :purpose "
			+ "and used_at is null and revoked_at is null", nativeQuery = true)
	int revokeOutstanding(UUID userId, String purpose);
}

package com.ricettine.media;

import java.util.Collection;
import java.util.List;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;

public interface MediaRepository extends JpaRepository<Media, String> {

	/** Bulk delete: flushes pending changes first and clears the context so no stale Media entity survives. */
	@Modifying(flushAutomatically = true, clearAutomatically = true)
	@Query("delete from Media m where m.id in :ids")
	int deleteRows(Collection<String> ids);

	@Query("select m.id from Media m where m.ownerId = :ownerId")
	List<String> idsOwnedBy(UUID ownerId);

	@Modifying
	@Query("delete from Media m where m.ownerId = :ownerId")
	int deleteOwnedBy(UUID ownerId);

	@Query("select m.id from Media m where m.kind = com.ricettine.media.MediaKind.RECIPE and m.recipeId = :recipeId")
	List<String> recipeMediaIds(UUID recipeId);

	/** Which of {@code ids} are RECIPE media attached to {@code recipeId}. */
	@Query("select m.id from Media m where m.kind = com.ricettine.media.MediaKind.RECIPE and m.recipeId = :recipeId "
			+ "and m.id in :ids")
	List<String> recipeMediaIdsAmong(UUID recipeId, Collection<String> ids);
}

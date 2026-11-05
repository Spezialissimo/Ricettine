package com.ricettine.recipe;

import jakarta.persistence.LockModeType;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;

public interface RecipeRepository extends JpaRepository<Recipe, UUID> {

	Optional<Recipe> findByIdAndAuthorId(UUID id, UUID authorId);

	/** Row-locks the recipe so the caller's version check is authoritative (concurrent writers queue up). */
	@Lock(LockModeType.PESSIMISTIC_WRITE)
	Optional<Recipe> findForUpdateByIdAndAuthorId(UUID id, UUID authorId);

	/** Share-locks the recipe: concurrent photo uploads proceed together, while a save or delete waits. */
	@Lock(LockModeType.PESSIMISTIC_READ)
	Optional<Recipe> findForShareByIdAndAuthorId(UUID id, UUID authorId);

	Optional<Recipe> findByShareTokenAndStatus(String shareToken, RecipeStatus status);

	boolean existsByIdAndAuthorId(UUID id, UUID authorId);

	List<Recipe> findByAuthorIdOrderByUpdatedAtDescIdAsc(UUID authorId);

	/** The listing rule: only PUBLISHED + PUBLIC recipes, newest publication first. */
	@Query("""
		select r from Recipe r
		where r.authorId = :authorId and r.status = com.ricettine.recipe.RecipeStatus.PUBLISHED
			and r.visibility = com.ricettine.recipe.Visibility.PUBLIC and r.publishedAt is not null
		order by r.publishedAt desc, r.id desc""")
	List<Recipe> listedByAuthor(UUID authorId);

	@Query("select r.shareToken from Recipe r where r.id = :id and r.status = com.ricettine.recipe.RecipeStatus.PUBLISHED")
	Optional<String> publishedShareToken(UUID id);
}

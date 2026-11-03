package com.ricettine.recipe;

import jakarta.persistence.LockModeType;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;

public interface RecipeRepository extends JpaRepository<Recipe, UUID> {

	Optional<Recipe> findByIdAndAuthorId(UUID id, UUID authorId);

	/** Row-locks the recipe so the caller's version check is authoritative (concurrent writers queue up). */
	@Lock(LockModeType.PESSIMISTIC_WRITE)
	Optional<Recipe> findForUpdateByIdAndAuthorId(UUID id, UUID authorId);

	List<Recipe> findByAuthorIdOrderByUpdatedAtDescIdAsc(UUID authorId);
}

package com.ricettine.recipe;

import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;

public interface RecipeRepository extends JpaRepository<Recipe, UUID> {

	Optional<Recipe> findByIdAndAuthorId(UUID id, UUID authorId);

	List<Recipe> findByAuthorIdOrderByUpdatedAtDescIdAsc(UUID authorId);
}

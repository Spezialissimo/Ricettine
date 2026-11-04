package com.ricettine.cookbook;

import java.util.List;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;

public interface CookbookAuthorRepository extends JpaRepository<CookbookAuthor, CookbookAuthor.Key> {

	boolean existsByCookbookIdAndUserId(UUID cookbookId, UUID userId);

	List<CookbookAuthor> findByCookbookIdOrderByJoinedAtAscUserIdAsc(UUID cookbookId);

	long countByCookbookId(UUID cookbookId);
}

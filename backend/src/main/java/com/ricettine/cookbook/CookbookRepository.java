package com.ricettine.cookbook;

import jakarta.persistence.LockModeType;
import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;

public interface CookbookRepository extends JpaRepository<Cookbook, UUID> {

	/** Row-locks the cookbook so concurrent adds queue up and the entry cap is authoritative. */
	@Lock(LockModeType.PESSIMISTIC_WRITE)
	@Query("select c from Cookbook c where c.id = :id")
	Optional<Cookbook> lockById(UUID id);

	Optional<Cookbook> findByShareToken(String shareToken);

	record SummaryRow(UUID id, String name, String visibility, UUID ownerId, long recipeCount, Instant updatedAt,
			String coverMediaId) {
	}

	/** Cookbooks the user owns or co-authors, with the entry count computed in SQL. */
	@Query("""
		select new com.ricettine.cookbook.CookbookRepository$SummaryRow(c.id, c.name, str(c.visibility), c.ownerId,
			count(e.recipeId), c.updatedAt, c.coverMediaId)
		from Cookbook c left join CookbookEntry e on e.cookbookId = c.id
		where c.ownerId = :userId
			or exists (select 1 from CookbookAuthor a where a.cookbookId = c.id and a.userId = :userId)
		group by c.id, c.name, c.visibility, c.ownerId, c.updatedAt, c.coverMediaId
		order by c.updatedAt desc, c.id asc""")
	List<SummaryRow> summariesFor(UUID userId);
}

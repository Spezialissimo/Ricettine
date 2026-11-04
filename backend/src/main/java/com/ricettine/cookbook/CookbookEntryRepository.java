package com.ricettine.cookbook;

import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;

public interface CookbookEntryRepository extends JpaRepository<CookbookEntry, CookbookEntry.Key> {

	long countByCookbookId(UUID cookbookId);

	/** An entry joined with its recipe's title and author. */
	record Row(UUID recipeId, String title, UUID authorId, UUID addedBy, Instant addedAt) {
	}

	@Query("""
		select new com.ricettine.cookbook.CookbookEntryRepository$Row(e.recipeId, r.title, r.authorId, e.addedBy,
			e.addedAt)
		from CookbookEntry e join Recipe r on r.id = e.recipeId
		where e.cookbookId = :cookbookId
		order by e.addedAt desc, e.recipeId asc""")
	List<Row> rows(UUID cookbookId);

	@Query("""
		select new com.ricettine.cookbook.CookbookEntryRepository$Row(e.recipeId, r.title, r.authorId, e.addedBy,
			e.addedAt)
		from CookbookEntry e join Recipe r on r.id = e.recipeId
		where e.cookbookId = :cookbookId and e.recipeId = :recipeId""")
	Optional<Row> row(UUID cookbookId, UUID recipeId);

	@Modifying
	@Query("delete from CookbookEntry e where e.cookbookId = :cookbookId and e.recipeId = :recipeId")
	int deleteEntry(UUID cookbookId, UUID recipeId);
}

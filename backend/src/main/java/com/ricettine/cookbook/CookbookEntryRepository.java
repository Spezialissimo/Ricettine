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
	record Row(UUID recipeId, String title, UUID authorId, UUID addedBy, Instant addedAt,
			String coverMediaId) {
	}

	@Query("""
		select new com.ricettine.cookbook.CookbookEntryRepository$Row(e.recipeId, r.title, r.authorId, e.addedBy,
			e.addedAt, r.coverMediaId)
		from CookbookEntry e join Recipe r on r.id = e.recipeId
		where e.cookbookId = :cookbookId
		order by e.addedAt desc, e.recipeId asc""")
	List<Row> rows(UUID cookbookId);

	@Query("""
		select new com.ricettine.cookbook.CookbookEntryRepository$Row(e.recipeId, r.title, r.authorId, e.addedBy,
			e.addedAt, r.coverMediaId)
		from CookbookEntry e join Recipe r on r.id = e.recipeId
		where e.cookbookId = :cookbookId and e.recipeId = :recipeId""")
	Optional<Row> row(UUID cookbookId, UUID recipeId);

	/** Entries whose recipe is PUBLISHED: all a cookbook link may show. */
	@Query("""
		select new com.ricettine.cookbook.CookbookEntryRepository$Row(e.recipeId, r.title, r.authorId, e.addedBy,
			e.addedAt, r.coverMediaId)
		from CookbookEntry e join Recipe r on r.id = e.recipeId
		where e.cookbookId = :cookbookId and r.status = com.ricettine.recipe.RecipeStatus.PUBLISHED
		order by e.addedAt desc, e.recipeId asc""")
	List<Row> publishedRows(UUID cookbookId);

	/**
	 * The cookbook token that currently opens this recipe: the cookbook has an entry for it and the recipe is
	 * PUBLISHED. The caller compares it with the presented token in constant time.
	 */
	@Query("""
		select c.shareToken from CookbookEntry e join Cookbook c on c.id = e.cookbookId
			join Recipe r on r.id = e.recipeId
		where c.shareToken = :token and e.recipeId = :recipeId
			and r.status = com.ricettine.recipe.RecipeStatus.PUBLISHED""")
	Optional<String> grantingToken(String token, UUID recipeId);

	/** Takes one person's entries out of a cookbook; the recipes themselves are untouched. */
	@Modifying
	@Query("delete from CookbookEntry e where e.cookbookId = :cookbookId and e.addedBy = :userId")
	int deleteAddedBy(UUID cookbookId, UUID userId);

	@Modifying
	@Query("delete from CookbookEntry e where e.cookbookId = :cookbookId and e.recipeId = :recipeId")
	int deleteEntry(UUID cookbookId, UUID recipeId);
}

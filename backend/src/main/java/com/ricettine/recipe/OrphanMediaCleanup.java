package com.ricettine.recipe;

import com.ricettine.media.MediaService;
import java.time.Duration;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.List;
import java.util.UUID;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

/**
 * Deletes recipe photos that were uploaded but never saved into the recipe (referenced by no cover and no step)
 * once they are older than {@code ricettine.media.orphan-min-age}. Each candidate is re-checked under the same row
 * lock a recipe save takes, so a save that references it concurrently either commits first (the photo is kept) or
 * runs after (and gets 400 {@code photo_not_in_recipe} instead of silently losing it).
 */
@Component
public class OrphanMediaCleanup {

	private static final Logger log = LoggerFactory.getLogger(OrphanMediaCleanup.class);
	private static final int BATCH = 500;

	private static final String UNREFERENCED = """
			m.kind = 'RECIPE' and m.created_at < ? \
			and not exists (select 1 from recipe r where r.cover_media_id = m.id) \
			and not exists (select 1 from step s where s.photo_media_id = m.id)""";

	private final JdbcTemplate jdbc;
	private final MediaService media;
	private final TransactionTemplate tx;
	private final Duration minAge;

	public OrphanMediaCleanup(JdbcTemplate jdbc, MediaService media, PlatformTransactionManager txManager,
			@Value("${ricettine.media.orphan-min-age:PT24H}") Duration minAge) {
		this.jdbc = jdbc;
		this.media = media;
		this.tx = new TransactionTemplate(txManager);
		this.minAge = minAge;
	}

	@Scheduled(fixedDelayString = "${ricettine.media.orphan-cleanup-interval:PT1H}")
	public void run() {
		int deleted = deleteOrphansOlderThan(minAge);
		if (deleted > 0) {
			log.info("Deleted {} orphaned recipe photos", deleted);
		}
	}

	/** Returns how many orphans were deleted. One candidate's failure doesn't stop the others. */
	public int deleteOrphansOlderThan(Duration age) {
		OffsetDateTime cutoff = OffsetDateTime.now(ZoneOffset.UTC).minus(age);
		int deleted = 0;
		List<Candidate> batch;
		do {
			batch = jdbc.query("select m.id, m.recipe_id from media m where " + UNREFERENCED
					+ " order by m.created_at, m.id limit " + BATCH,
					(rs, n) -> new Candidate(rs.getString(1), rs.getObject(2, UUID.class)), cutoff);
			int before = deleted;
			for (Candidate c : batch) {
				try {
					if (Boolean.TRUE.equals(tx.execute(status -> deleteIfStillOrphan(c, cutoff)))) {
						deleted++;
					}
				}
				catch (RuntimeException e) {
					log.warn("Failed to delete orphaned recipe photo {}", c.id(), e);
				}
			}
			if (deleted == before) {
				break; // nothing in this batch could be deleted: stop rather than loop over the same rows
			}
		} while (batch.size() == BATCH);
		return deleted;
	}

	private boolean deleteIfStillOrphan(Candidate c, OffsetDateTime cutoff) {
		if (c.recipeId() != null) {
			jdbc.query("select id from recipe where id = ? for update", rs -> {
			}, c.recipeId());
		}
		Integer still = jdbc.queryForObject("select count(*) from media m where m.id = ? and " + UNREFERENCED,
				Integer.class, c.id(), cutoff);
		if (still == null || still == 0) {
			return false;
		}
		media.delete(c.id());
		return true;
	}

	private record Candidate(String id, UUID recipeId) {
	}
}

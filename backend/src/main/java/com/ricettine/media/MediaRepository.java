package com.ricettine.media;

import java.util.List;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;

public interface MediaRepository extends JpaRepository<Media, String> {

	@Modifying
	@Query("delete from Media m where m.id = :id")
	int deleteRow(String id);

	@Query("select m.id from Media m where m.ownerId = :ownerId")
	List<String> idsOwnedBy(UUID ownerId);

	@Modifying
	@Query("delete from Media m where m.ownerId = :ownerId")
	int deleteOwnedBy(UUID ownerId);
}

package com.ricettine.media;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;

public interface MediaRepository extends JpaRepository<Media, String> {

	@Modifying
	@Query("delete from Media m where m.id = :id")
	int deleteRow(String id);
}

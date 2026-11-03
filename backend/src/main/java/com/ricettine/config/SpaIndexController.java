package com.ricettine.config;

import org.springframework.core.io.ClassPathResource;
import org.springframework.core.io.Resource;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

/** Serves index.html for "/" directly (Boot's welcome-page mapping only forwards, which is brittle). */
@RestController
class SpaIndexController {

	@GetMapping("/")
	ResponseEntity<Resource> index() {
		Resource index = new ClassPathResource("static/index.html");
		if (!index.exists()) {
			return ResponseEntity.notFound().build();
		}
		return ResponseEntity.ok().contentType(MediaType.TEXT_HTML).body(index);
	}
}

package com.ricettine.feed;

import com.ricettine.common.ApiException;
import com.ricettine.feed.FeedDtos.FeedPage;
import java.util.Map;
import org.springframework.http.CacheControl;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/feed")
public class FeedController {

	private final FeedService feed;

	FeedController(FeedService feed) {
		this.feed = feed;
	}

	@GetMapping
	ResponseEntity<FeedPage> feed(@RequestParam(required = false) String cursor,
			@RequestParam(required = false) String limit) {
		int n = 20;
		if (limit != null) {
			try {
				n = Integer.parseInt(limit);
			}
			catch (NumberFormatException e) {
				throw new ApiException(HttpStatus.BAD_REQUEST, "validation_failed", Map.of("limit", "invalid"));
			}
		}
		return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(feed.page(cursor, n));
	}
}

package com.ricettine.cookbook;

import com.ricettine.auth.CurrentUser;
import com.ricettine.cookbook.CookbookDtos.CookbookDto;
import com.ricettine.media.ImageVariant;
import com.ricettine.media.MediaService;
import com.ricettine.media.ProcessedUpload;
import java.io.IOException;
import java.io.UncheckedIOException;
import java.util.Set;
import java.util.UUID;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestPart;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

/**
 * Cookbook cover upload. Deliberately not transactional: ownership is checked first (so a non-owner can't use a
 * processing slot), then the image is processed with no transaction held, then {@link CookbookService#setCover}
 * re-checks the owner and swaps the cover in one short transaction.
 */
@RestController
@org.springframework.web.bind.annotation.RequestMapping("/api/cookbooks/{id}/cover")
class CookbookCoverController {

	static final Set<ImageVariant> VARIANTS = Set.of(ImageVariant.THUMB, ImageVariant.DISPLAY);

	private final CookbookService cookbooks;
	private final MediaService media;
	private final CurrentUser currentUser;

	CookbookCoverController(CookbookService cookbooks, MediaService media, CurrentUser currentUser) {
		this.cookbooks = cookbooks;
		this.media = media;
		this.currentUser = currentUser;
	}

	@PutMapping
	CookbookDto set(@PathVariable String id, @RequestPart("file") MultipartFile file) {
		UUID userId = currentUser.id();
		UUID cookbookId = CookbookController.parse(id);
		cookbooks.requireOwner(cookbookId, userId);
		ProcessedUpload upload = media.process(() -> {
			try {
				return file.getBytes();
			}
			catch (IOException e) {
				throw new UncheckedIOException(e);
			}
		}, VARIANTS);
		return cookbooks.setCover(userId, cookbookId, upload);
	}

	@DeleteMapping
	CookbookDto remove(@PathVariable String id) {
		return cookbooks.removeCover(currentUser.id(), CookbookController.parse(id));
	}
}

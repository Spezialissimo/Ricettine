package com.ricettine.recipe;

import com.ricettine.auth.CurrentUser;
import com.ricettine.media.ImageVariant;
import com.ricettine.media.MediaService;
import com.ricettine.media.ProcessedUpload;
import com.ricettine.recipe.RecipeDtos.PhotoDto;
import java.io.IOException;
import java.io.UncheckedIOException;
import java.util.Set;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestPart;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

/**
 * Recipe photo upload. Deliberately not transactional: ownership is checked first (so a non-owner can't use a
 * processing slot), then the image is processed with no transaction or pooled connection held, then a short
 * transaction re-checks the recipe and registers the photo.
 */
@RestController
public class RecipePhotoController {

	static final Set<ImageVariant> VARIANTS = Set.of(ImageVariant.THUMB, ImageVariant.DISPLAY);

	private final RecipeService recipes;
	private final MediaService media;
	private final CurrentUser currentUser;

	public RecipePhotoController(RecipeService recipes, MediaService media, CurrentUser currentUser) {
		this.recipes = recipes;
		this.media = media;
		this.currentUser = currentUser;
	}

	@PostMapping("/api/recipes/{id}/photos")
	ResponseEntity<PhotoDto> upload(@PathVariable String id, @RequestPart("file") MultipartFile file) {
		UUID authorId = currentUser.id();
		UUID recipeId = RecipeController.parse(id);
		recipes.requireOwned(authorId, recipeId);
		ProcessedUpload upload = media.process(() -> {
			try {
				return file.getBytes();
			}
			catch (IOException e) {
				throw new UncheckedIOException(e);
			}
		}, VARIANTS);
		return ResponseEntity.status(HttpStatus.CREATED).body(recipes.addPhoto(authorId, recipeId, upload));
	}
}

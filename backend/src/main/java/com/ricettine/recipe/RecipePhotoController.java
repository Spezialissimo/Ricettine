package com.ricettine.recipe;

import com.ricettine.auth.CurrentUser;
import com.ricettine.common.RateLimits;
import com.ricettine.media.ImageVariant;
import com.ricettine.media.MediaService;
import com.ricettine.media.ProcessedUpload;
import com.ricettine.media.RemoteImageFetcher;
import com.ricettine.recipe.RecipeDtos.PhotoDto;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import java.util.Set;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestPart;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

/**
 * Recipe photo upload. Deliberately not transactional: ownership is checked first (so a non-owner can't use a
 * processing slot), then the image is processed with no transaction or pooled connection held, then the
 * blobs are written with no transaction held, and finally a short transaction locks the recipe, re-checks it and the
 * photo cap, and registers the photo.
 */
@RestController
public class RecipePhotoController {

	static final Set<ImageVariant> VARIANTS = Set.of(ImageVariant.THUMB, ImageVariant.DISPLAY);

	private final RecipeService recipes;
	private final MediaService media;
	private final CurrentUser currentUser;
	private final RateLimits limits;
	private final RemoteImageFetcher remote;

	public RecipePhotoController(RecipeService recipes, MediaService media, CurrentUser currentUser,
			RateLimits limits, RemoteImageFetcher remote) {
		this.limits = limits;
		this.remote = remote;
		this.recipes = recipes;
		this.media = media;
		this.currentUser = currentUser;
	}

	@PostMapping("/api/recipes/{id}/photos")
	ResponseEntity<PhotoDto> upload(@PathVariable String id, @RequestPart("file") MultipartFile file) {
		UUID authorId = currentUser.id();
		UUID recipeId = RecipeController.parse(id);
		recipes.requireOwned(authorId, recipeId);
		limits.upload(authorId);
		recipes.requirePhotoRoom(recipeId);
		ProcessedUpload upload = media.process(MediaService.bytesOf(file), VARIANTS);
		return ResponseEntity.status(HttpStatus.CREATED).body(recipes.addPhoto(authorId, recipeId, upload));
	}

	/** A photo given by its web address (an image dragged out of a web page). */
	record UrlUpload(@NotBlank @Size(max = 2048) String url) {
	}

	/**
	 * Same checks and order as {@link #upload}, but the server downloads the image first ({@link RemoteImageFetcher}:
	 * public addresses only, 15 MB, images only). The download counts against the same upload rate limit.
	 */
	@PostMapping("/api/recipes/{id}/photos/from-url")
	ResponseEntity<PhotoDto> fromUrl(@PathVariable String id, @Valid @RequestBody UrlUpload body) {
		UUID authorId = currentUser.id();
		UUID recipeId = RecipeController.parse(id);
		recipes.requireOwned(authorId, recipeId);
		limits.upload(authorId);
		recipes.requirePhotoRoom(recipeId);
		byte[] bytes = remote.fetch(body.url());
		ProcessedUpload upload = media.process(() -> bytes, VARIANTS);
		return ResponseEntity.status(HttpStatus.CREATED).body(recipes.addPhoto(authorId, recipeId, upload));
	}
}

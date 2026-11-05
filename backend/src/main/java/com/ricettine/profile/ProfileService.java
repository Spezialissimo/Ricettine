package com.ricettine.profile;

import com.ricettine.account.User;
import com.ricettine.account.UserRepository;
import com.ricettine.common.ApiException;
import com.ricettine.cookbook.CookbookService;
import com.ricettine.media.ImageVariant;
import com.ricettine.media.MediaService;
import com.ricettine.profile.ProfileDtos.ProfileDto;
import com.ricettine.recipe.RecipeDtos.AuthorDto;
import com.ricettine.recipe.RecipeService;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;

/** Composes the recipe and cookbook listings; the visibility filtering lives in those services. */
@Service
class ProfileService {

	private final UserRepository users;
	private final RecipeService recipes;
	private final CookbookService cookbooks;
	private final MediaService media;

	ProfileService(UserRepository users, RecipeService recipes, CookbookService cookbooks, MediaService media) {
		this.users = users;
		this.recipes = recipes;
		this.cookbooks = cookbooks;
		this.media = media;
	}

	ProfileDto profile(String username, UUID viewerId) {
		User u = users.findByUsername(username)
			.orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "user_not_found"));
		boolean self = u.getId().equals(viewerId);
		AuthorDto person = new AuthorDto(u.getUsername(), u.getDisplayName(),
				u.getAvatarKey() == null ? null : media.url(u.getAvatarKey(), ImageVariant.AVATAR));
		return new ProfileDto(person, self, recipes.listedByAuthor(u.getId(), self),
				cookbooks.listedByOwner(u.getId(), self));
	}
}

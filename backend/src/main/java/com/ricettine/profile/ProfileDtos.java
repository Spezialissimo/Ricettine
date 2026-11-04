package com.ricettine.profile;

import com.ricettine.cookbook.CookbookDtos.ProfileCookbook;
import com.ricettine.recipe.RecipeDtos.AuthorDto;
import com.ricettine.recipe.RecipeDtos.ProfileRecipe;
import java.util.List;

public final class ProfileDtos {

	private ProfileDtos() {
	}

	public record ProfileDto(AuthorDto person, boolean self, List<ProfileRecipe> recipes,
			List<ProfileCookbook> cookbooks) {
	}
}

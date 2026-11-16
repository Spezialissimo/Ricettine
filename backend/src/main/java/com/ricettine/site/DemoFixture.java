package com.ricettine.site;

import java.math.BigDecimal;
import java.util.List;

/** The committed demo content ({@code demo/recipes.json}); its shape is guarded by DemoFixtureTest. */
record DemoFixture(List<User> users, List<Recipe> recipes, List<Cookbook> cookbooks) {

	record User(String username, String displayName, String avatar) {
	}

	record Recipe(String key, String author, String title, int portions, Integer prepMinutes, Integer cookMinutes,
			String notes, String visibility, boolean published, String photo, List<Group> groups, List<Step> steps) {
	}

	record Group(String name, List<Ingredient> ingredients) {
	}

	record Ingredient(BigDecimal amount, String unit, String name, String note) {
	}

	/** {@code photo} is an optional key into photos.json; the seeder does not use it yet. */
	record Step(String text, String photo) {
	}

	record Cookbook(String owner, String name, String description, String visibility, String cover,
			List<String> recipes, List<String> authors) {
	}
}

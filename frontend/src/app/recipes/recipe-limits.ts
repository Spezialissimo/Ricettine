// Recipe field limits, mirrored by hand from the backend's RecipeValidator (backend/src/main/java/com/ricettine/recipe/RecipeValidator.java). Change both together.

export const MAX_TITLE = 200;
export const MAX_NOTES = 10_000;
export const MAX_SOURCE = 500;
export const MAX_MINUTES = 10080;
export const MIN_PORTIONS = 1;
export const MAX_PORTIONS = 100;
export const MAX_GROUPS = 20;
export const MAX_GROUP_NAME = 100;
export const MAX_INGREDIENTS = 200;
export const MAX_INGREDIENT_NAME = 200;
export const MAX_STEPS = 100;
export const MAX_STEP_TEXT = 5000;

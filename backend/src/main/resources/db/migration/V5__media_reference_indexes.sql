-- Deleting a media row runs ON DELETE SET NULL on these columns, and orphan cleanup anti-joins on them:
-- index the referencing side so neither scans every step / recipe.
CREATE INDEX ix_step_photo_media ON step (photo_media_id) WHERE photo_media_id IS NOT NULL;
CREATE INDEX ix_recipe_cover_media ON recipe (cover_media_id) WHERE cover_media_id IS NOT NULL;

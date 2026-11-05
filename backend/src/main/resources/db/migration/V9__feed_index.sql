CREATE INDEX ix_recipe_feed ON recipe (published_at DESC, id DESC)
    WHERE status = 'PUBLISHED' AND visibility = 'PUBLIC';

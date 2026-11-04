ALTER TABLE media ADD COLUMN cookbook_id uuid NULL REFERENCES cookbook (id) ON DELETE SET NULL;
ALTER TABLE cookbook ADD COLUMN cover_media_id varchar(64) NULL REFERENCES media (id) ON DELETE SET NULL;

-- Deleting a media row runs ON DELETE SET NULL on cookbook.cover_media_id; deleting a cookbook does the same on
-- media.cookbook_id. Index the referencing sides so neither scans the whole table.
CREATE INDEX ix_cookbook_cover_media ON cookbook (cover_media_id) WHERE cover_media_id IS NOT NULL;
CREATE INDEX ix_media_cookbook ON media (cookbook_id) WHERE cookbook_id IS NOT NULL;

CREATE TABLE media (
    id         varchar(64) PRIMARY KEY,
    owner_id   uuid        NOT NULL REFERENCES app_user (id) ON DELETE CASCADE,
    kind       varchar(16) NOT NULL,
    recipe_id  uuid,
    created_at timestamptz NOT NULL
);

CREATE INDEX ix_media_owner ON media (owner_id);

INSERT INTO media (id, owner_id, kind, created_at)
SELECT avatar_key, id, 'AVATAR', now() FROM app_user WHERE avatar_key IS NOT NULL;

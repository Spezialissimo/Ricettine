CREATE TABLE recipe (
    id             uuid         PRIMARY KEY,
    author_id      uuid         NOT NULL REFERENCES app_user (id) ON DELETE CASCADE,
    status         varchar(16)  NOT NULL,
    visibility     varchar(16)  NOT NULL,
    title          varchar(200),
    portions       int          NOT NULL DEFAULT 1 CHECK (portions BETWEEN 1 AND 100),
    prep_minutes   int          CHECK (prep_minutes BETWEEN 0 AND 10080),
    cook_minutes   int          CHECK (cook_minutes BETWEEN 0 AND 10080),
    source         varchar(500),
    notes          text,
    cover_media_id varchar(64)  REFERENCES media (id) ON DELETE SET NULL,
    share_token    varchar(43)  NOT NULL UNIQUE,
    version        bigint       NOT NULL,
    created_at     timestamptz  NOT NULL,
    updated_at     timestamptz  NOT NULL,
    published_at   timestamptz
);

CREATE INDEX ix_recipe_author_updated ON recipe (author_id, updated_at DESC);

CREATE TABLE ingredient_group (
    id        uuid         PRIMARY KEY,
    recipe_id uuid         NOT NULL REFERENCES recipe (id) ON DELETE CASCADE,
    position  int          NOT NULL,
    name      varchar(100)
);

CREATE INDEX ix_ingredient_group_recipe ON ingredient_group (recipe_id);

CREATE TABLE ingredient (
    id       uuid          PRIMARY KEY,
    group_id uuid          NOT NULL REFERENCES ingredient_group (id) ON DELETE CASCADE,
    position int           NOT NULL,
    amount   numeric(10,3),
    unit     varchar(16),
    name     varchar(200)  NOT NULL,
    note     varchar(200)
);

CREATE INDEX ix_ingredient_group ON ingredient (group_id);

CREATE TABLE step (
    id             uuid         PRIMARY KEY,
    recipe_id      uuid         NOT NULL REFERENCES recipe (id) ON DELETE CASCADE,
    position       int          NOT NULL,
    text           varchar(5000) NOT NULL DEFAULT '',
    photo_media_id varchar(64)  REFERENCES media (id) ON DELETE SET NULL
);

CREATE INDEX ix_step_recipe ON step (recipe_id);

ALTER TABLE media ADD CONSTRAINT fk_media_recipe FOREIGN KEY (recipe_id) REFERENCES recipe (id) ON DELETE SET NULL;
CREATE INDEX ix_media_recipe ON media (recipe_id);

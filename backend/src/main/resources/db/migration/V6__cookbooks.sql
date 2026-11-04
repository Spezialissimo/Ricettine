CREATE TABLE cookbook (
    id          uuid          PRIMARY KEY,
    owner_id    uuid          NOT NULL REFERENCES app_user (id) ON DELETE CASCADE,
    name        varchar(100)  NOT NULL,
    description varchar(1000),
    visibility  varchar(16)   NOT NULL,
    share_token varchar(43)   NOT NULL UNIQUE,
    created_at  timestamptz   NOT NULL,
    updated_at  timestamptz   NOT NULL
);

CREATE INDEX ix_cookbook_owner ON cookbook (owner_id);

CREATE TABLE cookbook_author (
    cookbook_id uuid        NOT NULL REFERENCES cookbook (id) ON DELETE CASCADE,
    user_id     uuid        NOT NULL REFERENCES app_user (id) ON DELETE CASCADE,
    joined_at   timestamptz NOT NULL,
    PRIMARY KEY (cookbook_id, user_id)
);

CREATE INDEX ix_cookbook_author_user ON cookbook_author (user_id);

CREATE TABLE cookbook_entry (
    cookbook_id uuid        NOT NULL REFERENCES cookbook (id) ON DELETE CASCADE,
    recipe_id   uuid        NOT NULL REFERENCES recipe (id) ON DELETE CASCADE,
    added_by    uuid        REFERENCES app_user (id) ON DELETE SET NULL,
    added_at    timestamptz NOT NULL,
    PRIMARY KEY (cookbook_id, recipe_id)
);

CREATE INDEX ix_cookbook_entry_recipe ON cookbook_entry (recipe_id);
CREATE INDEX ix_cookbook_entry_added_by ON cookbook_entry (added_by);
CREATE INDEX ix_cookbook_entry_added ON cookbook_entry (cookbook_id, added_at DESC);

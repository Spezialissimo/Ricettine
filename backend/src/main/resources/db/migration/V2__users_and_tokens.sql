CREATE TABLE app_user (
    id            uuid         PRIMARY KEY,
    email         varchar(254) NOT NULL,
    username      varchar(30)  NOT NULL,
    display_name  varchar(80)  NOT NULL,
    password_hash varchar(255) NOT NULL,
    is_admin      boolean      NOT NULL DEFAULT false,
    avatar_key    varchar(100),
    created_at    timestamptz  NOT NULL,
    CONSTRAINT uq_app_user_email UNIQUE (email),
    CONSTRAINT uq_app_user_username UNIQUE (username)
);

CREATE TABLE one_time_token (
    id         uuid        PRIMARY KEY,
    purpose    varchar(32) NOT NULL,
    token_hash char(64)    NOT NULL,
    user_id    uuid        REFERENCES app_user (id) ON DELETE CASCADE,
    created_by uuid        REFERENCES app_user (id) ON DELETE CASCADE,
    expires_at timestamptz NOT NULL,
    used_at    timestamptz,
    revoked_at timestamptz,
    created_at timestamptz NOT NULL,
    CONSTRAINT uq_one_time_token_hash UNIQUE (token_hash)
);

CREATE TABLE instance_setup (
    id           smallint    PRIMARY KEY CHECK (id = 1),
    completed_at timestamptz NOT NULL
);

ALTER TABLE one_time_token ADD COLUMN cookbook_id uuid NULL REFERENCES cookbook (id) ON DELETE CASCADE;

CREATE INDEX ix_one_time_token_cookbook ON one_time_token (cookbook_id);

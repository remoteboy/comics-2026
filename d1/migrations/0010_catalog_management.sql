ALTER TABLE creators ADD COLUMN edit_version INTEGER NOT NULL DEFAULT 0;
ALTER TABLE publishers ADD COLUMN edit_version INTEGER NOT NULL DEFAULT 0;
CREATE TABLE creator_aliases (
 name TEXT PRIMARY KEY COLLATE NOCASE,
 creator_id INTEGER NOT NULL REFERENCES creators(id) ON DELETE CASCADE
);
CREATE INDEX idx_creator_alias_owner ON creator_aliases(creator_id);
CREATE TABLE publisher_aliases (
 name TEXT PRIMARY KEY COLLATE NOCASE,
 publisher_id INTEGER NOT NULL REFERENCES publishers(id) ON DELETE CASCADE
);
CREATE INDEX idx_publisher_alias_owner ON publisher_aliases(publisher_id);
CREATE TABLE catalog_changes (
 request_id TEXT PRIMARY KEY,
 input_json TEXT NOT NULL,
 before_json TEXT NOT NULL,
 source_guard INTEGER NOT NULL,
 target_guard INTEGER NOT NULL,
 name_guard INTEGER NOT NULL,
 created_at TEXT NOT NULL
);
CREATE TABLE catalog_redirects (
 kind TEXT NOT NULL CHECK(kind IN ('creator','publisher')),
 old_id INTEGER NOT NULL,
 new_id INTEGER NOT NULL,
 PRIMARY KEY(kind,old_id)
);

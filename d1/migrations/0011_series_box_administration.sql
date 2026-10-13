ALTER TABLE series ADD COLUMN edit_version INTEGER NOT NULL DEFAULT 0;
ALTER TABLE boxes ADD COLUMN edit_version INTEGER NOT NULL DEFAULT 0;
ALTER TABLE boxes ADD COLUMN creation_request_id TEXT;
CREATE UNIQUE INDEX idx_boxes_creation_request ON boxes(creation_request_id);
CREATE TABLE series_aliases (
 series_id INTEGER NOT NULL REFERENCES series(id) ON DELETE CASCADE,
 name TEXT NOT NULL COLLATE NOCASE,
 start_year INTEGER
);
CREATE UNIQUE INDEX idx_series_alias_unique ON series_aliases(series_id,name,COALESCE(start_year,0));
CREATE INDEX idx_series_alias_name ON series_aliases(name,start_year);
CREATE TABLE administration_changes (
 request_id TEXT PRIMARY KEY,
 entity_type TEXT NOT NULL CHECK(entity_type IN ('series','box')),
 entity_id INTEGER NOT NULL,
 input_json TEXT NOT NULL,
 before_json TEXT NOT NULL,
 version_guard INTEGER NOT NULL,
 content_guard INTEGER NOT NULL,
 created_at TEXT NOT NULL
);

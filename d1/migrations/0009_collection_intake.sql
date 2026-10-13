ALTER TABLE series ADD COLUMN creation_request_id TEXT;
CREATE UNIQUE INDEX idx_series_creation_request ON series(creation_request_id);
ALTER TABLE variants ADD COLUMN creation_request_id TEXT;
CREATE UNIQUE INDEX idx_variant_creation_request ON variants(creation_request_id);
CREATE TABLE intake_lookups (
  id TEXT PRIMARY KEY,
  payload_json TEXT NOT NULL,
  expires_at TEXT NOT NULL
);
CREATE TABLE intake_requests (
  request_id TEXT PRIMARY KEY,
  input_json TEXT NOT NULL,
  warnings_json TEXT NOT NULL DEFAULT '[]',
  series_guard INTEGER NOT NULL DEFAULT 1,
  cover_guard INTEGER NOT NULL DEFAULT 1,
  result_holding_id INTEGER REFERENCES holdings(id),
  created_at TEXT NOT NULL
);

ALTER TABLE variants ADD COLUMN edit_version INTEGER NOT NULL DEFAULT 0;
CREATE TABLE comic_metadata_edits (
  request_id TEXT PRIMARY KEY,
  variant_id INTEGER NOT NULL REFERENCES variants(id),
  expected_version INTEGER NOT NULL,
  input_json TEXT NOT NULL,
  before_json TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE TABLE copy_box_moves (
  request_id TEXT PRIMARY KEY,
  input_json TEXT NOT NULL,
  before_json TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE copy_box_move_items (
  request_id TEXT NOT NULL REFERENCES copy_box_moves(request_id),
  holding_id INTEGER NOT NULL REFERENCES holdings(id),
  expected_version INTEGER NOT NULL,
  PRIMARY KEY (request_id, holding_id)
);

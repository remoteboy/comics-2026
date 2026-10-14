CREATE TABLE copy_archives (
    request_id TEXT PRIMARY KEY,
    holding_id INTEGER NOT NULL REFERENCES holdings(id),
    expected_version INTEGER NOT NULL,
    quantity INTEGER NOT NULL CHECK(quantity > 0),
    before_json TEXT NOT NULL,
    created_at TEXT NOT NULL,
    restored_at TEXT
);
CREATE INDEX idx_copy_archives_holding ON copy_archives(holding_id, created_at);
CREATE TABLE copy_archive_restores (
    request_id TEXT PRIMARY KEY,
    archive_id TEXT NOT NULL REFERENCES copy_archives(request_id),
    expected_version INTEGER NOT NULL,
    input_json TEXT NOT NULL,
    created_at TEXT NOT NULL
);

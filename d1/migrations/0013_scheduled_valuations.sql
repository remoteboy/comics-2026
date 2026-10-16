CREATE TABLE scheduled_valuation_state (
    id INTEGER PRIMARY KEY CHECK(id = 1),
    lease_token TEXT,
    locked_until TEXT NOT NULL DEFAULT '1970-01-01',
    scheduled_at INTEGER NOT NULL DEFAULT -1,
    started_at TEXT,
    completed_at TEXT,
    status TEXT NOT NULL DEFAULT 'waiting',
    error_text TEXT
);
INSERT INTO scheduled_valuation_state(id) VALUES(1);
CREATE TABLE scheduled_valuation_attempts (
    provider_variant_id TEXT PRIMARY KEY,
    attempted_at TEXT NOT NULL,
    status TEXT NOT NULL
);

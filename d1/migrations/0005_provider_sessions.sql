CREATE TABLE provider_sessions (
  provider TEXT PRIMARY KEY,
  encrypted_payload TEXT NOT NULL,
  iv TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

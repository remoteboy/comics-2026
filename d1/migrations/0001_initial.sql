PRAGMA foreign_keys = ON;

CREATE TABLE publishers (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    created_at TEXT,
    updated_at TEXT
);

CREATE TABLE series (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    sort_name TEXT,
    start_year INTEGER,
    status TEXT NOT NULL DEFAULT 'ended' CHECK (status IN ('ongoing', 'ended')),
    created_at TEXT,
    updated_at TEXT
);

CREATE INDEX idx_series_name ON series(name);
CREATE INDEX idx_series_sort_name ON series(sort_name);

CREATE TABLE issues (
    id INTEGER PRIMARY KEY,
    series_id INTEGER NOT NULL REFERENCES series(id) ON DELETE CASCADE,
    number TEXT NOT NULL,
    type TEXT NOT NULL DEFAULT 'issue' CHECK (type IN ('issue', 'annual')),
    created_at TEXT,
    updated_at TEXT,
    UNIQUE (series_id, number, type)
);

CREATE INDEX idx_issues_series_number ON issues(series_id, number);

CREATE TABLE variants (
    id INTEGER PRIMARY KEY,
    issue_id INTEGER NOT NULL REFERENCES issues(id) ON DELETE CASCADE,
    publisher_id INTEGER REFERENCES publishers(id) ON DELETE SET NULL,
    name TEXT NOT NULL DEFAULT '',
    story_title TEXT,
    first_appearance_of TEXT,
    details TEXT,
    cover_price_cents INTEGER,
    image_key TEXT,
    created_at TEXT,
    updated_at TEXT
);

CREATE INDEX idx_variants_issue_id ON variants(issue_id);
CREATE INDEX idx_variants_publisher_id ON variants(publisher_id);

CREATE TABLE boxes (
    id INTEGER PRIMARY KEY,
    type TEXT NOT NULL DEFAULT 'short' CHECK (type IN ('long', 'short', 'magazine')),
    label TEXT,
    created_at TEXT,
    updated_at TEXT
);

CREATE TABLE holdings (
    id INTEGER PRIMARY KEY,
    variant_id INTEGER NOT NULL REFERENCES variants(id) ON DELETE CASCADE,
    grade_tenths INTEGER,
    quantity INTEGER NOT NULL DEFAULT 1 CHECK (quantity >= 0),
    box_id INTEGER REFERENCES boxes(id) ON DELETE SET NULL,
    current_value_cents INTEGER,
    purchase_price_cents INTEGER,
    created_at TEXT,
    updated_at TEXT
);

CREATE INDEX idx_holdings_variant_id ON holdings(variant_id);
CREATE INDEX idx_holdings_box_id ON holdings(box_id);
CREATE INDEX idx_holdings_value ON holdings(current_value_cents DESC);

CREATE TABLE creators (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    first_name TEXT,
    last_name TEXT,
    slug TEXT,
    created_at TEXT,
    updated_at TEXT
);

CREATE TABLE variant_credits (
    id INTEGER PRIMARY KEY,
    variant_id INTEGER NOT NULL REFERENCES variants(id) ON DELETE CASCADE,
    creator_id INTEGER NOT NULL REFERENCES creators(id) ON DELETE CASCADE,
    role TEXT,
    created_at TEXT,
    updated_at TEXT
);

CREATE INDEX idx_variant_credits_variant ON variant_credits(variant_id);
CREATE INDEX idx_variant_credits_creator ON variant_credits(creator_id);

CREATE TABLE external_refs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    entity_type TEXT NOT NULL CHECK (entity_type IN ('series', 'variant')),
    entity_id INTEGER NOT NULL,
    provider TEXT NOT NULL,
    external_id TEXT NOT NULL,
    metadata_json TEXT,
    created_at TEXT,
    UNIQUE (entity_type, entity_id, provider, external_id)
);

CREATE INDEX idx_external_refs_lookup ON external_refs(provider, external_id);
CREATE INDEX idx_external_refs_entity ON external_refs(entity_type, entity_id);

CREATE TABLE price_snapshots (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    holding_id INTEGER NOT NULL REFERENCES holdings(id) ON DELETE CASCADE,
    provider TEXT NOT NULL,
    grade_tenths INTEGER,
    price_cents INTEGER NOT NULL,
    observed_at TEXT NOT NULL,
    source_event_id INTEGER,
    UNIQUE (holding_id, provider, observed_at, price_cents, source_event_id)
);

CREATE INDEX idx_price_snapshots_holding_time ON price_snapshots(holding_id, observed_at DESC);
CREATE INDEX idx_price_snapshots_time ON price_snapshots(observed_at DESC);

CREATE TABLE price_alerts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    holding_id INTEGER NOT NULL REFERENCES holdings(id) ON DELETE CASCADE,
    old_price_cents INTEGER NOT NULL,
    new_price_cents INTEGER NOT NULL,
    change_percent REAL,
    window_days INTEGER,
    status TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'seen', 'watching', 'dismissed')),
    detected_at TEXT NOT NULL
);

CREATE INDEX idx_price_alerts_status_time ON price_alerts(status, detected_at DESC);

CREATE TABLE sync_runs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    provider TEXT NOT NULL,
    started_at TEXT NOT NULL,
    completed_at TEXT,
    status TEXT NOT NULL CHECK (status IN ('running', 'success', 'failed', 'partial')),
    cursor TEXT,
    stats_json TEXT,
    error_text TEXT
);

CREATE TABLE import_metadata (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
);

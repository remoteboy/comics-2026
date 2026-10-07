PRAGMA foreign_keys = ON;

CREATE TABLE sale_intelligence_settings (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    minimum_current_value_cents INTEGER NOT NULL DEFAULT 2000 CHECK (minimum_current_value_cents >= 0),
    minimum_absolute_movement_cents INTEGER NOT NULL DEFAULT 1000 CHECK (minimum_absolute_movement_cents >= 0),
    minimum_percentage_movement REAL NOT NULL DEFAULT 25 CHECK (minimum_percentage_movement >= 0),
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

INSERT OR IGNORE INTO sale_intelligence_settings(id) VALUES (1);

CREATE TABLE sale_watch_state (
    holding_id INTEGER PRIMARY KEY REFERENCES holdings(id) ON DELETE CASCADE,
    is_watched INTEGER NOT NULL DEFAULT 1 CHECK (is_watched IN (0, 1)),
    notes TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_sale_watch_state_watched
    ON sale_watch_state(is_watched, updated_at DESC);

CREATE TABLE sold_comp_cache (
    provider TEXT NOT NULL,
    provider_variant_id TEXT NOT NULL,
    fetched_at TEXT NOT NULL,
    response_json TEXT NOT NULL,
    PRIMARY KEY(provider, provider_variant_id)
);

CREATE INDEX idx_sold_comp_cache_fetched
    ON sold_comp_cache(fetched_at DESC);

PRAGMA foreign_keys = ON;

CREATE TABLE current_valuations (
    holding_id INTEGER PRIMARY KEY REFERENCES holdings(id) ON DELETE CASCADE,
    provider TEXT NOT NULL,
    provider_variant_id TEXT,
    grade_tenths INTEGER,
    price_cents INTEGER,
    source_price_cents INTEGER,
    condition_percentage REAL,
    observed_at TEXT,
    refreshed_at TEXT NOT NULL,
    sync_run_id INTEGER REFERENCES sync_runs(id) ON DELETE SET NULL
);

CREATE INDEX idx_current_valuations_provider ON current_valuations(provider);
CREATE INDEX idx_current_valuations_refreshed ON current_valuations(refreshed_at DESC);
CREATE INDEX idx_current_valuations_observed ON current_valuations(observed_at DESC);

INSERT INTO current_valuations (
    holding_id,
    provider,
    provider_variant_id,
    grade_tenths,
    price_cents,
    source_price_cents,
    condition_percentage,
    observed_at,
    refreshed_at
)
SELECT
    h.id,
    'legacy',
    (
        SELECT er.external_id
        FROM external_refs er
        WHERE er.entity_type = 'variant'
          AND er.entity_id = h.variant_id
          AND er.provider = 'zap'
        ORDER BY er.id
        LIMIT 1
    ),
    h.grade_tenths,
    h.current_value_cents,
    h.current_value_cents,
    1.0,
    COALESCE(
        (SELECT MAX(ps.observed_at) FROM price_snapshots ps WHERE ps.holding_id = h.id),
        h.updated_at,
        h.created_at
    ),
    COALESCE(h.updated_at, h.created_at, datetime('now'))
FROM holdings h;

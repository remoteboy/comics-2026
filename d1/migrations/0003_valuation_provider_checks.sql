PRAGMA foreign_keys = ON;

CREATE TABLE provider_price_checks (
    provider TEXT NOT NULL,
    provider_variant_id TEXT NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('priced', 'no_price', 'error')),
    checked_at TEXT NOT NULL,
    error_text TEXT,
    PRIMARY KEY (provider, provider_variant_id)
);

CREATE INDEX idx_provider_price_checks_status
    ON provider_price_checks(provider, status, checked_at DESC);

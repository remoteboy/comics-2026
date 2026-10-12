-- Keep ownership edits and provider refreshes from overwriting one another.
ALTER TABLE holdings ADD COLUMN edit_version INTEGER NOT NULL DEFAULT 0;
ALTER TABLE holdings ADD COLUMN valuation_epoch INTEGER NOT NULL DEFAULT 0;
ALTER TABLE holdings ADD COLUMN creation_request_id TEXT;
CREATE UNIQUE INDEX idx_holdings_creation_request ON holdings(creation_request_id);

-- A condition/cover correction starts a new comparable price history.
ALTER TABLE price_snapshots ADD COLUMN valuation_epoch INTEGER NOT NULL DEFAULT 0;
ALTER TABLE price_snapshots ADD COLUMN variant_id INTEGER REFERENCES variants(id) ON DELETE SET NULL;
UPDATE price_snapshots SET variant_id = (
    SELECT variant_id FROM holdings WHERE holdings.id = price_snapshots.holding_id
);

CREATE TABLE collection_edits (
    request_id TEXT PRIMARY KEY,
    source_holding_id INTEGER NOT NULL REFERENCES holdings(id),
    expected_version INTEGER NOT NULL,
    result_holding_id INTEGER REFERENCES holdings(id),
    input_json TEXT NOT NULL,
    before_json TEXT NOT NULL,
    created_at TEXT NOT NULL
);

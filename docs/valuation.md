# Valuation engine

Phase 7 introduces an explicit valuation layer without discarding the migrated legacy baseline.

## Current valuation model

`current_valuations` stores the provenance and freshness of each holding's current value. Existing `holdings.current_value_cents` remains the denormalized value used by collection/dashboard queries and is updated atomically with the explicit valuation row.

When migration `0002_valuation_engine.sql` is applied to the migrated collection, every existing holding is seeded as `provider = 'legacy'`. That makes old values visible as a fallback without presenting them as fresh market data.

A live Zap valuation records:

- the Zap variant ID,
- the holding grade,
- the grade-adjusted current value,
- the source NM value,
- the Zap condition multiplier,
- the provider observation time,
- the local refresh time,
- the sync run that produced it.

## Raw grade calculation

The current Zap site exposes `issue_conditions`, which maps raw comic grades to a percentage of NM. The valuation sync uses that observed table rather than embedding its own grade assumptions.

For example, a grade 8.0 holding uses the current percentage returned for 8.0 against the issue's current NM value. If a holding grade is missing or is not present in the provider table, the engine skips it rather than inventing a price.

Graded/slabbed prices remain a separate provider surface. Phase 7 does not reinterpret raw holdings as slabbed copies.

## Sync strategy

The engine intentionally does not make one live request per holding. The collection contains roughly 9,500 holdings, so a brute-force refresh would be wasteful and fragile.

It uses two complementary paths observed in the current Zap application:

- **Recent changes** — the database-wide recent-price-change RPC is useful for fast movers, but the captured endpoint reports only the latest 100 rows. The sync therefore consumes that capped window without pretending it is a historical backfill.
- **Backfill batches** — the exact `issue_prices` request used by Zap's collection UI fetches the latest raw price for one issue. The app refreshes up to 50 stale/legacy holdings per batch with six requests in flight, then applies the holding's actual grade multiplier.

The `/valuations` page exposes both actions. Repeating backfill batches progressively replaces the migrated fallback with live prices; scheduled execution can reuse the same services during the Cloudflare deployment phase.

## Snapshots and movement

`price_snapshots` continues to contain recovered legacy changes. Live sync appends a new snapshot only when the holding's stored price actually changes; unchanged refreshes update freshness/provenance without duplicating observations.

Movement windows compare the current live value with the closest stored observation at least 30 days old, 90 days old, and the earliest known observation. A missing comparison remains unknown rather than being treated as zero.

## Freshness

A live Zap valuation is considered fresh for seven days. The UI distinguishes:

- live/fresh values,
- live but stale values,
- legacy fallback values,
- missing prices.

The seven-day threshold is intentionally much wider than Zap's daily pricing cadence so a short provider outage does not immediately mark the whole collection stale.

## Local migration

After pulling the Phase 7 schema change, update an existing local database from `app/`:

```bash
yarn db:migrate
```

The migration runner recognizes the existing Phase 1 database as having `0001_initial.sql` already applied, then applies only newer migrations.

# Comics application

The Astro application for the migrated comics collection.

## Local commands

```bash
yarn db:migrate
yarn smoke:data
yarn smoke:covers
yarn dev
yarn build
yarn check
yarn format:check
yarn test
yarn test:e2e
```

The app accesses the migrated SQLite database through small query/mutation interfaces. Reads remain repository-driven, while valuation writes use an atomic `batch()` boundary that can later map to Cloudflare D1 without rewriting feature services. Run `yarn db:migrate` after schema changes before starting the app.

Cover images are served from the existing legacy image directory configured through `LEGACY_IMAGE_ROOT`; the 952 MB image archive does not need to live inside this repository.

## Structure

- `src/components/` — shared presentation components.
- `src/features/` — domain-oriented collection, boxes, dashboard, valuation and sale-intelligence code.
- `src/db/` — database interface and local adapter.
- `src/providers/` — transport-free provider adapters and normalized provider types.
- `src/pages/` — Astro routes kept deliberately thin.
- `scripts/` — local migration/image checks and deterministic test DB creation.
- `tests/unit/` — pure filter/format/helper tests.
- `tests/integration/` — real repository SQL against an in-memory fixture DB.
- `tests/e2e/` — Playwright route and browser smoke tests.

See `../docs/testing.md` for the full test workflow and the repository-level `docs/roadmap.md` for project status.

## Live Zap probe

The `/providers` route keeps the recorded provider adapter visible alongside an opt-in probe of the current Zap Supabase API. Configure `ZAP_SUPABASE_PUBLISHABLE_KEY`, `ZAP_ACCESS_TOKEN` and `ZAP_REFRESH_TOKEN` in `.env`; none of these values is rendered in the page or used by normal collection browsing. Seed these values from a dedicated Zap login session rather than the browser session you normally use, so the app exclusively owns that refresh-token rotation chain.

When a refresh token is configured, the server refreshes the Supabase session shortly before JWT expiry and retries one unauthorized request after rotating the session. Rotated access/refresh tokens are persisted outside the repository at `~/.config/comics-collection/zap-session.json` with owner-only permissions. Set `ZAP_SESSION_PATH` to override that location. Delete the session file if you intentionally replace the Zap browser session and want the values in `.env` to seed a new local session.

## Valuations

The `/valuations` route shows live Zap coverage, stale/legacy fallback counts, movement windows and provider sync history. Manual syncs consume Zap's capped recent-change feed for fast movers. The baseline queue refreshes up to 50 unique Zap variants per batch through the same latest-price request used by Zap's collection UI, fetches each variant only once, and values every matching holding independently at its actual raw grade. The page can run that queue continuously and resume safely after interruption. See `../docs/valuation.md` for the model and sync strategy.

## Sale intelligence

The `/sales` route ranks live-priced holdings against configurable current-value, absolute-movement and percentage-movement thresholds. Watch state and notes are stored per holding so copies of the same cover at different grades can be reviewed independently. Individual review pages can call Zap's observed `ebay-sold-lookup` Edge Function on demand and cache the returned public sold evidence by Zap variant ID. See `../docs/sale-intelligence.md` for the sourcing and API-access decisions.

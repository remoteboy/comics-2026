# Comics application

The read-only Astro application for the migrated comics collection.

## Local commands

```bash
yarn smoke:data
yarn smoke:covers
yarn dev
yarn build
yarn check
yarn format:check
yarn test
yarn test:e2e
```

The app reads the local migrated SQLite database through a small `QueryDatabase` interface. Feature repositories accept that interface as an optional dependency, so production pages use the local application database while tests use a deterministic in-memory SQLite database. The same boundary can later be implemented by Cloudflare D1 without rewriting pages or components.

Cover images are served from the existing legacy image directory configured through `LEGACY_IMAGE_ROOT`; the 952 MB image archive does not need to live inside this repository.

## Structure

- `src/components/` — shared presentation components.
- `src/features/` — domain-oriented collection, boxes, dashboard and valuation code.
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

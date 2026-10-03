# Comics application

The read-only Astro application for the migrated comics collection.

## Local commands

```bash
yarn smoke:data
yarn smoke:covers
yarn dev
yarn build
yarn format:check
```

The app reads the local migrated SQLite database through a small `QueryDatabase` interface. Feature repositories depend on that interface rather than directly on SQLite, so the local adapter can later be replaced by Cloudflare D1 without rewriting pages or components.

Cover images are served from the existing legacy image directory configured through `LEGACY_IMAGE_ROOT`; the 952 MB image archive does not need to live inside this repository.

## Structure

- `src/components/` — shared presentation components.
- `src/features/` — domain-oriented collection, boxes, dashboard and valuation code.
- `src/db/` — database interface and local adapter.
- `src/pages/` — Astro routes kept deliberately thin.
- `scripts/` — local data/image smoke checks.

See the repository-level `docs/roadmap.md` for project status.

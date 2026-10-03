# Comics collection — read-only prototype

The first UI slice for the migrated comics collection. It is intentionally read-only while we validate the new data model against the legacy app.

## Stack

- Astro 7 + TypeScript
- Tailwind CSS 4 via the Vite plugin
- Yarn 4 with the `node_modules` linker (Vite does not recommend PnP)
- Node's built-in SQLite driver for local development
- D1-compatible SQL/data model from Phase 1

The repositories depend on a tiny async `QueryDatabase` interface. The local adapter is SQLite; the Cloudflare deployment will provide a D1 adapter without changing feature components or repository queries.

## Local setup

Requirements: Node 22.16+ and Corepack.

The project intentionally uses Yarn 4 with `nodeLinker: node-modules`; Vite no longer recommends Yarn PnP.

```bash
corepack enable
yarn install
cp .env.example .env
```

Set `COMICS_DB_PATH` to the Phase 1 SQLite database and `LEGACY_IMAGE_ROOT` to the old cover directory. For the directory layout in the migration package, this works for the database:

```env
COMICS_DB_PATH=../output/comics.d1.sqlite
LEGACY_IMAGE_ROOT=/Users/you/path/to/old-comics/storage/public/images
```

Verify the migrated data and image path, then run:

```bash
yarn smoke:data
yarn smoke:covers
yarn dev
```

`smoke:covers` reads `.env` directly and checks a sample of database cover keys against `LEGACY_IMAGE_ROOT`.

The cover route reads the legacy image directory in place, so the 952 MB archive does not need to be copied into this project. Missing covers render a neutral placeholder.

## Implemented screens

- Dashboard: migrated collection totals, most valuable holdings, recovered valuation history
- Collection: paginated/searchable series list
- Series detail: cover and list views
- Comic/variant detail: holding data, creators, external IDs, price history
- Boxes: summary and visual box contents

## Project boundaries

Feature code lives under `src/features`. Shared presentation components live under `src/components`. SQL is kept in feature repositories rather than page components. Database runtime details live under `src/db`.

The application is currently configured with the Node adapter only so it can query the migrated SQLite file directly. Cloudflare deployment is deliberately deferred until the read-only UI and migration are accepted; the next database adapter will target D1.

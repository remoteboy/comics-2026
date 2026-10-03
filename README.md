# Comics collection modernization

A replacement for the legacy Laravel comics collection application, built around the existing collection data rather than around the old framework or provider implementations.

The project is currently read-only while the migrated data, collection UX and provider boundaries are validated. Live valuation and intake providers come later.

## Repository layout

- `app/` — Astro + TypeScript application.
- `d1/migrations/` — D1/SQLite schema.
- `scripts/import_legacy.py` — repeatable importer for the legacy MySQL export.
- `docs/roadmap.md` — project phases and current position.
- `docs/reconciliation.md` — migration acceptance results.
- `docs/testing.md` — local/CI testing strategy and commands.
- `docs/providers.md` — provider normalization boundary and recorded-data decisions.
- `output/` — generated local database and provider archives; intentionally ignored by Git.

## Current stack

- Astro 7 + TypeScript
- Tailwind CSS 4
- Yarn 4 using the `node_modules` linker
- Node's built-in SQLite driver for local development
- D1-compatible relational schema
- Vitest + Playwright testing
- Transport-free ZapKapow and Comic Vine provider adapters

## Local setup

Run the migration first if `output/comics.d1.sqlite` does not exist:

```bash
python3 scripts/import_legacy.py /path/to/comics_20261003_1532IST-.sql
```

Then from `app/`:

```bash
corepack enable
yarn install
cp .env.example .env
```

Configure the local database and legacy cover directory:

```env
COMICS_DB_PATH=../output/comics.d1.sqlite
LEGACY_IMAGE_ROOT=/absolute/path/to/legacy/storage/public/images
```

Verify the local inputs and run the app:

```bash
yarn smoke:data
yarn smoke:covers
yarn test
yarn test:e2e
yarn dev
```

## Migration baseline

The migrated collection reconciles to:

- 1,793 series
- 9,401 logical issues
- 9,577 variants
- 9,572 holdings
- 9,680 physical copies
- 84 boxes
- 30,452 creator credits
- $52,083.29 legacy stored value

The importer intentionally preserves legacy provider identities and avoids speculative deduplication. See `docs/reconciliation.md` for details.

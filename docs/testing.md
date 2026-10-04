# Testing

The application uses two deliberately small testing layers:

- **Vitest** for pure utility tests and repository integration tests against an in-memory SQLite fixture database.
- **Playwright** for route smoke tests and a small number of browser-level navigation checks.

The tests do not depend on the migrated production collection or the 952 MB legacy cover archive. Provider normalization tests use small, source-derived JSON fixtures copied from the archived legacy provider responses.

## Deterministic fixture database

`app/tests/fixtures/test-data.sql` contains a small representative collection with:

- ordinary and unusual issue numbers (`1`, `1/2`, `12.1`),
- multiple variants of one logical issue,
- `NULL` and `$0` valuations,
- an unboxed holding,
- a multi-copy holding,
- non-contiguous box IDs,
- creator credits and provider references,
- recovered price history,
- explicit current-valuation rows and live valuation writes.

Provider fixtures under `app/tests/fixtures/providers/` cover both generations of recorded Zap responses, stored Zap update events and a Comic Vine alternate-cover record. These fixtures contain no live credentials. Phase 7 tests additionally verify Zap condition multipliers, price-change-only snapshots, sync history and actual-grade valuation.

Integration tests load the real D1 schema into an in-memory SQLite database and then apply this seed data. Playwright uses the same fixture to create `app/.test/comics.sqlite` before starting Astro.

## Commands

Run from `app/`:

```bash
yarn test             # all Vitest unit/integration tests
yarn test:unit        # pure utility/filter tests
yarn test:integration # repository/database tests
yarn test:watch       # Vitest watch mode

yarn test:e2e         # create fixture DB and run Playwright in Chromium
yarn test:e2e:ui      # Playwright UI mode

yarn check            # Astro + TypeScript diagnostics
yarn build            # production build
yarn format:check     # Prettier verification
yarn test:ci          # complete local CI-equivalent suite
```

After first applying the testing phase, install the new dev dependencies and commit the resulting `app/yarn.lock` update with the phase:

```bash
yarn install
```

The first Playwright run on a machine also requires the Chromium test binary:

```bash
yarn playwright install chromium
```

## Repository testing pattern

Feature repository functions accept an optional `QueryDatabase` argument. Production callers omit it and receive the normal application database; tests pass the in-memory fixture database directly. This keeps database tests deterministic without global mocks or test-only state leaking into pages.

## CI

`.github/workflows/ci.yml` runs on pushes to `main`/`master` and on pull requests. It installs dependencies immutably, installs Chromium, then runs formatting, Astro diagnostics, Vitest, the production build and Playwright.

The CI suite intentionally does **not** run `smoke:data` or `smoke:covers`, because those validate local migration artifacts that are correctly excluded from Git.

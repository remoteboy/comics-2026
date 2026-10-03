# Changelog

All notable changes to this project will be documented in this file.

The project follows Semantic Versioning while the replacement application is developed.

## [0.4.0] - 2026-10-03

### Added

- Shared transport-free provider interfaces for normalized series, issue, variant, valuation and update results.
- Recorded-response ZapKapow adapter supporting both legacy flat and later rich payload shapes.
- ZapKapow grade-based valuation and update-feed normalization.
- Recorded-response Comic Vine adapter preserving synthetic cover indexes, images and person credits.
- Provider fixtures copied from the archived legacy responses and regression tests around real response quirks.
- Provider architecture documentation, including the Comic Vine alternate-cover discovery decision.

### Changed

- Application version advanced to `0.4.0`.
- Phase 4 tooling baseline incorporates the locally verified TypeScript 6/Astro checker setup and isolated Playwright test server.

## [0.3.0] - 2026-10-03

### Added

- Vitest unit and repository integration testing.
- Deterministic SQLite fixture database built from the production D1 schema.
- Regression coverage for unusual issue numbers, multiple variants, missing/zero valuations, unboxed holdings and multiple copies.
- Playwright route and browser-navigation smoke tests.
- Astro/TypeScript diagnostics through `@astrojs/check`.
- GitHub Actions CI for formatting, diagnostics, unit/integration tests, production build and Chromium smoke tests.
- Testing workflow documentation.

### Changed

- Feature repository functions accept an optional database dependency so tests can exercise real SQL without global mocks.

### Fixed

- Series summaries no longer count catalogued-but-unowned variants as holdings with missing valuations.

## [0.2.0] - 2026-10-03

### Added

- Dashboard collection-health summary and biggest recovered valuation movements.
- Collection search across titles, publishers and creators.
- Collection filters for status, valuation gaps, stale values and unboxed comics.
- Collection sorting by title, value, copy count and issue count.
- Series-local search across issues, variants, creators and significance metadata.
- More informative cover and list views for series.
- Box filtering, grouped contents and previous/next box navigation.
- Breadcrumb navigation and improved responsive/accessibility behaviour.

### Changed

- Pricing is explicitly labelled as a legacy baseline until live provider sync is restored.
- Comic details and recovered price history are easier to scan.
- Repository-wide EditorConfig, Prettier and Git ignore configuration now lives at the repository root.

## [0.1.0] - 2026-10-03

### Added

- Initial migrated D1-compatible schema and importer.
- Read-only Astro collection prototype.
- Local SQLite adapter and cover-image serving.
- Data and image smoke checks.

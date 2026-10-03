# Changelog

All notable changes to this project will be documented in this file.

The project follows Semantic Versioning while the replacement application is developed.

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

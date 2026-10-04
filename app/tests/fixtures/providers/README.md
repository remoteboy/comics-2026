# Provider fixture provenance

These fixtures are copied from the legacy export/archive and intentionally contain no live credentials.

- `zap-flat-issue.json` — legacy issue `8221`, Zap issue `311140`.
- `zap-rich-variant.json` — legacy issue `16498`, Zap variant `288960`.
- `zap-updates.json` — exact update objects preserved in legacy update batches `1`, `5` and `23` (Zap issue IDs `49926`, `102864`, `319365`, `323239`).
- `comic-vine-cover-b.json` — legacy issue `16428`, synthetic Comic Vine cover ID `4000-767904-1`.

The archived application did not retain title-endpoint responses, so series tests intentionally normalize the series references embedded in issue responses instead of constructing fictional title payloads.

Current Zap fixtures were reduced from the sanitized 2026-10-04 browser HAR and contain no bearer token, publishable key, username, email, or user ID. They cover title search, issue/variant listing, exact issue detail, raw-comic condition multipliers, graded prices, and the database-wide price-change feed.

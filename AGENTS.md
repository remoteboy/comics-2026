# Project working instructions

Read `docs/handover.md` before starting work, then the relevant implementation and tests. Use `docs/operations.md` for deployment, scheduled valuations and backup/recovery. `docs/roadmap.md` contains historical planning; check the handover and current code before treating an item as unfinished.

## Product expectations

- Preserve the conveniences of the old collection app. The rebuilt app should be easier to use; keep backend complexity out of normal user flows.
- Search should offer autocomplete where appropriate. Filters should narrow results as the user types or changes a selection, with keyboard support and a normal form fallback.
- An issue lookup should offer available covers, grade and purchase details. Keep Add & Next fast and retain useful defaults.
- Matching copies can share a visible group while retaining independent purchase dates, prices and history. Grade changes must leave incompatible valuation history behind and allow a restored grade to rejoin its group.
- Never fabricate a zero valuation when Zap has no price. Preserve valid existing values on provider failure. Respect concurrent edits and removed copies.
- Annuals must be identifiable and filterable. Preserve filters when switching views.

## Repository and commands

- `app/`: Astro/TypeScript application; Node/SQLite locally, Cloudflare Worker/D1/R2 in production.
- `d1/migrations/`: ordered SQL migrations. Local and remote migration commands are separate.
- Node >=22.16 and the Yarn version pinned in `app/package.json`.
- Run app commands from `app/`: `yarn db:migrate`, `yarn test:ci`, `yarn dev`.
- `yarn test:ci` runs formatting, Astro checks, unit/integration tests, Node build and Playwright against a deterministic test database. Report exactly which checks ran; test discovery is not browser execution.
- Production: `yarn d1:migrate` before `yarn deploy` when migrations are added. Deploy uses the generated `dist/server/wrangler.json`; do not change it back to deploying the source config directly.
- D1 migration directory is `../d1/migrations`, relative to `app/wrangler.jsonc`.
- Keep secrets, provider tokens, live databases and backup contents out of Git and patches. Do not reset or overwrite owner changes.

## Delivering work

- This project has used downloadable Git patches. Confirm the current working arrangement before assuming access to the owner's checkout or production.
- The owner downloads patches to `~/Downloads/`. Application commands should reference that directory; `git apply` runs from repository root, then `cd app` for Yarn.
- Build against the current accepted source. Validate each patch against that exact baseline. Later patches must not silently depend on an undelivered patch.
- Use `git apply --check` before applying. Avoid unrelated changelog/roadmap context in patches; those files have caused repeated conflicts.
- Include concise validation results, migration requirements and useful manual checks. Do not claim live deployment, browser success or backup recovery without evidence.
- Inspect rendered markup before choosing browser assertions. Empty-state titles currently render as paragraphs. Locate a section through stable visible content, not through controls that disappear when Zap is unconfigured.
- Update the handover after a meaningful phase. Ask before destructive actions or production changes outside the user's authorization; routine reversible implementation work can proceed.

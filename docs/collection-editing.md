# Collection editing: first rebuild patch

This patch adds editing to the existing collection. It is based on the supplied 0.8.0 source ZIP and does not deploy anything. Full provider-assisted intake, image upload, shared metadata editing and inline box reassignment remain subsequent work.

Baseline archive SHA-256: `9f9a878c6b539280e14902f2272f383bde1d9766146c245f3df36fd4c1d03135`.

## What to review

Open a comic, choose **Edit copy / Edit copies**, and change grade, box, quantity, purchase price or current unit value. A quantity group initially selects **Change just one**. Saving that choice separates one physical copy; the remaining copies keep their original details, history and watch notes. Changing only its box keeps its current value. Changing grade or cover now fetches a fresh Zap value unless a manual or explicitly unvalued setting is chosen. See [copy-zap-pricing.md](copy-zap-pricing.md).

**Add another copy** creates ownership of a cover already stored for that issue. It now requests a Zap value when saving; it does not create new catalogue covers. The cover picker can correct an owned copy to another stored cover of the same logical issue. It does not overwrite cover images or shared metadata.

Matching cover/grade/box copies now display together across the comic, series and box pages. See [copy-grouping.md](copy-grouping.md) for the purchase-detail breakdown and partial-value handling.

The comic page selects history using `?copy=<id>` and offers a selector when there are multiple copy rows. Existing price history is retained. Corrections start a separate comparison period to prevent grade, cover or manual-value changes appearing as market gains. Manual estimates are labelled and can be replaced by a later provider refresh; purchase price is separate and untouched by refreshes.

## Apply and test locally

Run these from the repository root, substituting the actual path to the patch. First back up the local SQLite file configured by `COMICS_DB_PATH`. Do not rerun the legacy importer: that tool recreates its destination database.

```sh
git apply --check /path/to/collection-editing.patch
git apply /path/to/collection-editing.patch
cd app
yarn install --immutable
yarn db:migrate
yarn format:check
yarn check
yarn test
yarn build
yarn build:cloudflare
yarn test:e2e
yarn dev
```

Use a copy of your collection database for the first manual review. `yarn test:e2e` creates and edits the isolated `.test/comics.sqlite` fixture database; it does not use production data. The added browser test edits fixture copy 3, adds another copy and verifies history selection.

Migration `0006_collection_editing.sql` adds edit revisions, comparison-period and cover context on snapshots, creation request identity, and an edit audit table. It backfills historical cover identity from the existing ownership records. Existing legacy IDs, quantities, grades, unit values, references and history rows remain intact. This historical identity is the best available mapping; unknown historical grade/cover corrections are not retroactively reconstructed.

Apply production migrations only after local review, through the existing deployment workflow. This patch does not modify Access configuration, Wrangler bindings, secrets, dependencies or the released package version. The changelog uses Unreleased.

## Checks completed in the build environment

- 114 unit/integration tests passed, including ten collection-edit integration tests and three form-boundary tests.
- Astro/TypeScript check: no errors, warnings or hints.
- Local and Cloudflare builds passed.
- Real HTTP smoke checks exercise rendering, splitting, identical request replay, stale saves, origin rejection, validation recovery, cover reassignment and selected-copy history.
- A separate local Cloudflare D1 runtime smoke check exercises the migrated schema, edits, request replay and stale provider-result suppression.
- The patch is checked against a fresh extraction of `current_repo.zip` before delivery.

Browser tests are supplied but were not executed here: the Chromium download returned an invalid archive. Mobile layout and browser interaction still need review locally. No live Zap call or production write was made during verification.

## Manual review cases

1. Move a copy to another box, then to Unboxed. The unit value and price history should stay intact.
2. Change just one of two identical copies to a different grade and box. Total quantity should be unchanged, the original copy should be unaffected and the changed copy should receive its own fresh Zap value. If lookup is unavailable, choose an explicit fallback before saving.
3. Add another copy, enter a manual value and confirm independent grade/value/history. Repeat the identical save request: ownership must only be created once.
4. Correct one copy to another stored cover. Other copies and the previous cover image must be unchanged.
5. Open the same edit in two tabs; save one, then try the other. The stale form should explain the conflict rather than overwrite the first edit.
6. Enter an invalid grade or quantity and check that typed values stay visible. Blank value is unknown; manual zero is a known zero.
7. Check the immediate Zap valuation after a grade correction. Check that the new grade is used and neither sale intelligence nor the dashboard treats the correction as a market gain.

## Implementation notes

Collection writes use the existing database batch abstraction. An audit insert checks the source revision inside the batch; a failed guard aborts the entire split/save. Request identity prevents repeat ownership creation. Live valuation writes advance the same revision and conditionally write their current value and snapshot only when the selected grade, provider cover and captured revision still match.

SQLite and D1 use the same SQL. History comparisons are constrained by `valuation_epoch`; old snapshots stay available in the comic history. A split starts a new copy history with a baseline when its unchanged value is retained, and records its source copy in the edit audit. Source history and watch notes are not duplicated onto the new row.

This is the first collection-editing implementation, not a completed rebuild. The next intake patch must restore issue-number-to-provider-cover discovery, annuals, creator/publisher persistence and the one-save add-comic workflow recorded in the audit.

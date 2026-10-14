# Legacy workflow review and remaining release work

Reviewed 13 October 2026 against the supplied Laravel source and rebuilt app. This follows the original model/controller/route/template audit and the owner's successful reviews of intake, copy management, catalogue browsing and administration. It is a source and local-test review; it does not certify production data, provider account access or Cloudflare configuration.

## Working collection conveniences

| Legacy workflow                                   | Replacement and outcome                                                                                                                                                                                              |
| ------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Add a title using provider lookup                 | Intake searches titles by name and resolves provider IDs internally. A manually entered title and issue can be saved in one flow.                                                                                    |
| Edit title name, sort, year and status            | Edit series preserves aliases, owned copies and history.                                                                                                                                                             |
| Correct title Zap / Comic Vine IDs                | Advanced provider matches in Edit series; explicit apply checkbox, format validation, duplicate ownership guard and audit record. Cover mappings stay intact.                                                        |
| Enter an issue number and choose its exact cover  | Intake performs exact issue/type matching, paginates Zap results, shows provider cover images and provides manual image fallback.                                                                                    |
| Find annuals                                      | Intake's Annual choice keeps annual and ordinary issue identities separate. Comic pages now label Annual explicitly too.                                                                                             |
| Choose grade, value, quantity and box at addition | One intake save creates ownership; Zap prices are grade-sensitive and update matching owned grades. Purchase date and price remain distinct from valuation.                                                          |
| Add several issues quickly                        | Add & Next retains the title and useful defaults; fractional/textual issue numbers are cleared rather than guessed.                                                                                                  |
| Manage separate grades / boxes / copies           | Comic page groups matching copies while retaining independent purchase details and histories. Single-copy edits split internally.                                                                                    |
| Move a group to a box from the title list         | Inline Move copies remains usable after live filtering and returns to the current view.                                                                                                                              |
| Remove a Value row / owned group                  | Remove copies retains the record and sets its owned quantity to zero. Confirmation is explicit; active totals, boxes, sale candidates and refresh targets exclude it. Restore copies is available on the comic page. |
| Edit cover/story/significance/description/credits | Edit comic details explains that the data is shared by copies of this exact cover.                                                                                                                                   |
| Fetch missing creators                            | Fetch from Zap / Comic Vine fills empty metadata fields and adds missing credits in the editor. Review and Save applies them; existing manual entries are retained.                                                  |
| Fetch Comic Vine description                      | The editor previews provider notes with an explicit replacement button. It does not replace the selected cover or derive cover identity from a gallery position.                                                     |
| Read stored rich descriptions                     | Legacy/provider HTML becomes readable escaped text with paragraph and list breaks. Executable/hidden content is discarded. This preserves readability without a rich-text editor.                                    |
| Repair a missing image                            | Shared cover upload remains available; provider images are cached during intake where possible.                                                                                                                      |
| Gallery/list switch and issue filtering           | The view and query are retained together. Typing narrows results live and suggests matching issues; Clear actually clears the query. GET filtering remains usable without JavaScript.                                |
| Linked boxes for a title                          | Title pages link to the actual boxes containing owned copies, with labels and quantities.                                                                                                                            |
| Most valuable individual comic                    | The series statistic uses unit value and says Top per copy. The dashboard separately labels its quantity-inclusive purchase-group ranking.                                                                           |
| Alphabetical box contents                         | Custom series sort names are honoured, with a display-name fallback.                                                                                                                                                 |
| Creator/publisher browsing                        | Searchable directories, renames/aliases/explicit merges; publishers show series, creators expand issues with live title/role filtering.                                                                              |
| Values and price movement                         | Per-purchase histories, grade/cover boundaries, current valuation and sale review remain available. Removed records retain their histories.                                                                          |

## Boundaries retained deliberately

Advanced provider matches are also available in Edit comic details, restoring the old issue/cover ID editor. Changing its Zap cover identity clears incompatible current prices and starts a new comparison period; earlier history and purchases remain. Unchanged Zap IDs and Comic Vine-only corrections retain prices. Refresh a corrected Zap match from Valuations afterwards.

- Remote Zap collection mirroring is not restored. Local additions, edits and removals must work without a remote ownership write. This was already documented in the original audit.
- Automated image recovery is supplied through backfill scripts; individual repair is available in the browser. The legacy all-images action printed diagnostic output and fetched old endpoints; it is not recreated as that web route.
- Empty or broken legacy resource actions are not treated as working conveniences. Supporting box, creator and publisher administration now exceeds those old implementations.
- Comic Vine person credits are issue-level. Its provider suggestions omit cover artists because they cannot establish attribution for an exact alternative cover; existing manual cover credits are retained.
- Series, issue and cover metadata remain in the catalogue after ownership is removed. Catalogue cover counts can therefore exceed active owned copies. Zero-quantity legacy records are retained; only removals made through this workflow have a recorded quantity available for one-click restoration.
- Title match editing does not automatically relink covers. Correct a cover match explicitly from its comic editor.

## Installation and manual checks

Apply migration `0012_copy_archiving.sql` locally before running the app. Apply it remotely before deploying this patch. It creates removal/restore ledgers; existing owned quantities and histories are unchanged.

1. In Edit comic details, fetch a provider linked to that comic. Existing story/notes/credits must stay; blank fields and new credits should be suggested. Fetch again and check that credits do not duplicate. Explicitly use the provider notes, then Save. A failed lookup must retain your draft.
2. Open a comic with old HTML in its notes. Check readable paragraphs and no raw tags. Check that an annual's heading says Annual.
3. On a series, type an issue number, cover description or creator. Results should narrow immediately and suggestions should lead to matching comics. Switch List/Covers and Clear; the chosen view stays. Open one of its box links.
4. Change a series Sort name and check its placement within a shared box. Check Top per copy on a series where one purchase group has several lower-value copies.
5. Remove a small purchase group you can safely restore. Check confirmation, owned quantity/value and box contents. Expand Removed copies on the comic page, inspect its price history, then restore it and check purchase date/price and original quantity.
6. In Edit series, expand Advanced provider matches. Check the displayed mappings. Only apply a correction using a known correct provider title ID; ordinary series edits should leave mappings untouched. A duplicate ID already assigned to another series must be rejected.

## Next backlog: operational completion

The collection workflow gaps identified above now have implementations and regression coverage. Live provider success, mobile usability and production behaviour still require owner review.

Remaining release work is operational: scheduled valuation refresh and monitoring, backup/export and a tested restore procedure, provider-session recovery, production sale-intelligence review, deployment smoke checks, and data/cover/box reconciliation before a release tag. Barcode lookup, camera-assisted cover matching and listing preparation remain optional features, not legacy parity requirements.

Validation for this patch is reported with its delivery. Browser regressions are supplied for owner execution; no browser or production checks should be inferred solely from passing unit tests.

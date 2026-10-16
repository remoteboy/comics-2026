# Collection rebuild handover

Last updated: 16 October 2026. The owner has marked this rebuild phase done for now. Prefer normal use and targeted fixes over starting another large phase without a request.

## Current state

The app runs locally with SQLite and online as an Astro Cloudflare Worker using D1 and R2. Cloudflare Access is implemented. Core legacy conveniences have been restored:

- Intake: provider title autocomplete, issue/annual lookup, cover selection and images, grades, purchase price/date, Zap valuation, manual entry/photo fallback and Add & Next defaults.
- Copies: grade/value editing, grouping compatible copies, independent purchase details/history, inline box moves, reversible removal and restore. Removing the last owned copy must retain access to removed copies.
- Catalogue: shared metadata and cover repair/upload, explicit provider-match correction, reviewed enrichment suggestions and creator credits. Provider fetches must not silently replace entered details.
- Series and boxes: editing, aliases/status/year/sort, box administration, live filters and autocomplete. A series box link opens the box prefiltered to that series.
- Search: global title/creator/publisher/box suggestions; collection-page autocomplete; publisher results show series; creator results group expandable issues by series with scoped live filters.
- Annuals: dedicated All issues / Regular issues / Annuals selector on a series, retained across List/Covers. Annual text search also works. Series and box covers identify records marked as annuals.
- Providers: encrypted persisted Zap sessions, rotating-token refresh and manual session recovery already exist. Do not list provider-session recovery as unimplemented. Local expired credentials previously caused enrichment errors while production worked.
- Valuations: existing prices/history, initial baseline tools, recent-change sync and automatic refresh. Backup and verified restore commands are implemented.

## Scheduling and operations

Migration `0013_scheduled_valuations.sql` adds scheduled refresh state and attempt tracking. The owner applied the previously missed scheduling/backup patch and supplied a production screenshot showing **Automatic refresh: success**.

- Cron runs every two minutes, selecting up to two stale, missing or non-Zap cover prices. Fresh means within seven days. One cover fetch fans out to matching owned copies at their own grades.
- Failed/missing-price attempts have a six-hour retry delay. Old prices remain available. Leases and edit-version checks protect overlapping work and user changes.
- At 22:30 UTC, the same scheduler also runs the bounded recent-change feed sync. This is 23:30 Dublin in summer and 22:30 in winter.
- This is a rotating refresh, not a full-collection reprice every two minutes. Approximately 9,600 covers can take roughly a week for a first sweep at this batch size.
- Node development does not run the Cloudflare scheduler. The local page reports automatic refresh disabled.
- See `docs/operations.md` for configuration, pause/resume, deployment, provider recovery and backup commands.

Backups are operator-run commands, not an automatic backup cron. They snapshot/export the database and referenced covers with hashes and integrity checks. Restore writes to a fresh destination and refuses to overwrite an existing one. Missing covers require explicit acknowledgement. Keep backups private and retain the provider-session encryption secret separately.

**Outstanding operational follow-up:** the owner has not yet confirmed a remote backup -> verify -> restore drill into a separate local directory. Do not mark that verified or introduce an in-place production restore.

## Latest UI work and validation boundary

The valuations page was becoming too long and difficult to understand. The latest layout patch:

- Keeps automatic refresh status and valuation health visible.
- Shows operational timestamps including seconds in Europe/Dublin time without changing purchase-date formatting elsewhere.
- Puts refresh history before the movement table; shows five recent entries, with older entries expandable.
- Labels scheduled, initial-baseline and recent-change runs separately when recorded stats identify their mode. Older unclassified runs use a generic Zap refresh label.
- Collapses baseline tools and movement details, and simplifies technical explanations.

Latest delivered files: `valuation-page-layout.patch`, followed by `valuation-layout-test-fix.patch`. The latter corrects a browser test that located the baseline section through a Zap-only button; the deterministic fixture may not configure Zap. It now locates the section by summary text and checks its heading after expansion.

Before that test fix, the owner reported **50 of 51 browser tests passed**; the only failure was that missing-button locator. The follow-up passed formatting, test discovery and patch compatibility checks here, but the owner has not yet reported the final browser rerun. Do not describe all 51 as confirmed green until verified.

The layout implementation passed Astro diagnostics and a Node build. The unit/integration run passed 241 tests and timed out on two existing integration tests; both passed when rerun separately with the workspace temporary directory and one worker. The Dublin summer/winter timestamp check passed. Chromium was unavailable in the assistant workspace, so browser execution was performed by the owner.

The preceding annual/filter patches were confirmed passing in that owner's 50/51 run. Some earlier follow-up patch filenames were superseded after assertion/context mistakes; use repository source and current tests rather than trying to replay every attachment from the chat.

The owner was given this commit message for the latest layout work:

```text
feat: simplify valuations layout and clarify refresh history
```

Do not assume the commit exists; inspect Git status/log in the real checkout. The assistant's packaging checkout has synthetic commits and is not authoritative for the owner's commit history.

## Starting a future session

1. Read `AGENTS.md`, this file and relevant operations documentation.
2. Inspect actual Git status, recent commits and current tests before editing. Ask for current source if a new chat has no checkout or attachment; do not reconstruct a patch from memory.
3. Keep the completed phase closed unless the owner requests work. The remaining known operational task is the backup/restore drill; collect normal-use friction for later fixes.
4. If the owner reports a failure, use its exact test/code context and preserve their changes. Supply a small compatible patch with honest validation and focused manual checks.

Owner's usual local checkout is `~/www/mkdev/comics-2026`; app commands run in its `app` directory. Patch downloads go in `~/Downloads/`.

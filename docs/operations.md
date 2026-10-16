# Scheduled valuations, backups and recovery

This phase uses the existing encrypted Zap session store and automatic token refresh. It does not replace provider-session recovery. Production credentials, account access and live scheduled execution require owner verification after deployment.

## Install and deploy

Apply `0013_scheduled_valuations.sql` locally, then run the normal checks:

```bash
cd app
yarn db:migrate
yarn test:ci
yarn build:cloudflare
```

Before deploying, apply the same migration remotely:

```bash
yarn d1:migrate
yarn deploy
```

The generated Worker still serves Astro through the adapter's normal handler. Its additional scheduled handler uses the same D1 binding, Zap configuration and encryption key. No new Worker or provider secrets are required.

`wrangler.jsonc` now sets `VALUATION_SCHEDULE_ENABLED=true` and the cron `*/2 * * * *`. Scheduling starts after deployment. Cloudflare cron configuration changes can take time to propagate. To pause automatic work, set the variable to `false` in the source configuration and redeploy. Leave the cron present so resuming only requires changing the variable. Node development does not run cron jobs.

## Refresh behaviour and observation

- Every two minutes, inspect up to two unique mapped covers with missing, non-Zap or older-than-seven-day valuations. The batch selects previously unattempted covers first, then the oldest attempted covers. New purchases and manual price edits retain their existing behaviour.
- Fetch a cover price once and apply each owned purchase's grade independently. Removed copies and ambiguous Zap mappings are excluded. A stale provider response cannot overwrite a changed grade, cover, quantity or value.
- Retry missing, failed and unsupported-grade prices after at least six hours, without preventing other covers from being processed. Missing prices do not become zero. Existing values remain visible during provider outages.
- At 22:30 UTC, also run the existing bounded recent-change feed sync. This is 23:30 in Dublin during summer time and 22:30 during winter time. The rotating sweep covers comics outside that feed window. A recent-feed result marked partial means its existing 100-row cap was reached; it is not a claim of complete market coverage.
- With roughly 9,600 unique covers, the initial rotating sweep can take about a week at this deliberately small batch size. It is not a full daily reprice of the collection. Future frequency/batch tuning should follow observed provider and Cloudflare usage.
- A ten-minute database lease blocks overlapping scheduled runs. Duplicate or older delivered ticks are skipped. A failed lease can be reclaimed by a later tick. Each invocation records a normal sync run, so a stopped process can leave an older run marked running; the lease and the latest scheduled status establish whether current work is active.

Open **Valuations** after deployment. It shows automatic refresh status and the last completion time alongside the existing sync history. Check again after ten minutes: completion timestamps and sync records should advance. Check **Providers** if a run fails. Expired or revoked credentials may require the existing session refresh/replacement workflow; local and production sessions remain separate.

The nightly feed and small batch run within the same scheduled lease. No public HTTP endpoint is added for triggering automatic work. Existing manual refresh actions now reject foreign-origin submissions.

## Create an independent backup

Run these from `app`. Keep backup destinations outside the repository. Backups contain the full database, purchase/price history, catalogue edits and encrypted provider-session records. Keep them private, and retain the session encryption secret separately in your existing secret manager. Cloudflare Worker secrets are not exported by these commands.

Production D1 and every referenced R2 cover:

```bash
yarn backup:create --remote \
  --bucket comics-collection-covers \
  --output "$HOME/Downloads/comics-backup-2026-10-16"
```

Use a new dated directory for each backup. Wrangler must be authenticated to the correct Cloudflare account with D1 export and R2 read access. The database is exported first, then the cover references in that snapshot are downloaded in bounded parallel batches. Progress is printed; the first complete R2 download can take a while for the full collection. The app's cover replacement workflow uses new keys, so copies of those referenced images remain available during a backup. External deletion/overwrite of R2 keys is outside that guarantee and should be avoided during export.

For a local SQLite database and local covers:

```bash
yarn backup:create \
  --database /absolute/path/to/comics.sqlite \
  --covers /absolute/path/to/uploaded-covers \
  --covers /absolute/path/to/legacy-covers \
  --output "$HOME/Downloads/comics-local-backup-2026-10-16"
```

Repeat `--covers` for each configured local image root; the first existing file for a key wins. SQLite's backup API captures a consistent database snapshot, including data committed in WAL mode. Only cover keys referenced by the snapshot are copied, including covers whose copies have been removed. Null image references are retained in the database; they do not promise an image file exists.

A completed directory contains `comics.sqlite`, `covers/` and `manifest.json`. Production exports also retain `database.sql` for a D1 restore. The manifest records SHA-256 checksums, table counts, physical copy totals and stored collection value. Database integrity and foreign keys are checked before a backup is published. Incomplete staging directories are not published as completed backups, and an existing destination is refused.

Missing referenced images make a full backup fail. If these are known legacy gaps you have consciously accepted, add `--allow-missing-covers`. The manifest lists each missing image and labels the backup `missing-covers`. Verification and restoration then require that flag too. To intentionally export only the database, add `--database-only`; its unexported image references are still listed as missing. Never treat either option as complete image protection.

```bash
yarn backup:verify --backup "$HOME/Downloads/comics-backup-2026-10-16"
```

Independent backups are explicit operator commands in this phase. The Cloudflare cron runs valuations, not exports to your computer. Schedule the backup command on an always-on machine or CI runner with the appropriate Wrangler credentials if unattended independent exports are required. Keep at least one verified copy on a separate device or storage service. This patch does not add a cloud backup-retention/deletion job.

## Rehearse restoration without touching live data

```bash
yarn backup:restore \
  --backup "$HOME/Downloads/comics-backup-2026-10-16" \
  --output "$HOME/Downloads/comics-restored-2026-10-16"
```

The output directory must not exist. The command validates the backup, copies the database and covers into a temporary directory, verifies the copied bytes and database again, then publishes the recovered copy. It never replaces your running database. A missing-cover backup requires `--allow-missing-covers` here as well.

Start a second local app against the recovered paths:

```bash
COMICS_DB_PATH="$HOME/Downloads/comics-restored-2026-10-16/comics.sqlite" \
COVER_UPLOAD_ROOT="$HOME/Downloads/comics-restored-2026-10-16/covers" \
LEGACY_IMAGE_ROOT="$HOME/Downloads/comics-restored-2026-10-16/covers" \
yarn dev --port 4325
```

Check collection totals against the manifest, then check a purchased copy's date, price, grade, box, price history and cover image. The automated round-trip test also exercises database and cover corruption, missing images and refusal to overwrite an existing destination. Live provider lookup on the recovered local app needs its own valid credentials; that is independent of database recovery.

## Production disaster recovery

Cloudflare D1 Time Travel is a separate built-in recovery mechanism, with retention dependent on the account plan. Inspect its current availability in the account rather than assuming a retention period. It does not recover R2 objects, and does not replace independent exports.

For an exported SQL backup, verify it locally first. Rehearse importing `database.sql` into a **new, empty D1 database** and uploading the recovered covers into a **new private R2 bucket**. For example, choose new recovery resource names, create them with Wrangler, and execute:

```bash
yarn wrangler d1 execute comics-collection-recovery --remote \
  --file "$HOME/Downloads/comics-backup-2026-10-16/database.sql"
```

Use the new database's exact name or ID; do not substitute the live `COMICS_DB` binding. Upload each file under its unchanged cover key using `yarn wrangler r2 object put NEW_BUCKET/KEY --remote --file PATH`. Test the recovered app against those isolated bindings before changing the live bindings. Keep Cloudflare Access configured on any recovery deployment. Do not put D1 session encryption secrets in a backup archive or in Git.

Local-only backups contain a SQLite snapshot rather than a D1 SQL export. Restore and inspect them locally; a tested SQL export/import conversion is required before using them for D1 recovery. This phase does not provide an automatic in-place production restore command.

References: [Astro custom Worker entrypoints](https://docs.astro.build/en/guides/integrations-guide/cloudflare/), [Cloudflare cron triggers](https://developers.cloudflare.com/workers/configuration/cron-triggers/), [D1 export/import](https://developers.cloudflare.com/d1/best-practices/import-export-data/), [D1 Time Travel](https://developers.cloudflare.com/d1/reference/time-travel/).

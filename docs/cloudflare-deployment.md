# Cloudflare deployment

The application keeps the existing Node + local SQLite development path and has a separate Cloudflare build target for production.

## Production resources

The first deployment uses:

- Cloudflare Workers for Astro SSR
- D1 for collection/application data
- D1 for the encrypted rotating Zap session
- R2 for comic cover images
- Worker secrets for Zap bootstrap credentials and the session-encryption key

## Install Cloudflare tooling

From `app/`:

```bash
yarn install
yarn cf:types
```

`@astrojs/cloudflare` and `wrangler` are pinned in `package.json`. `yarn install` updates the lockfile after applying the deployment patch.

## Authenticate Wrangler

```bash
yarn wrangler login
```

## Create D1

Create the production database and let Wrangler add the binding to `wrangler.jsonc`:

```bash
yarn wrangler d1 create comics-collection \
  --binding COMICS_DB \
  --update-config
```

After this command, add this property to the generated `COMICS_DB` binding if Wrangler did not preserve it:

```json
"migrations_dir": "../d1/migrations"
```

Then apply the schema:

```bash
yarn wrangler d1 migrations apply COMICS_DB --remote
```

## Import the local collection

Export data only from the local SQLite database:

```bash
python3 scripts/export-d1-data.py \
  ../output/comics.d1.sqlite \
  ../output/comics.d1.data.sql
```

Import it into D1:

```bash
yarn wrangler d1 execute COMICS_DB \
  --remote \
  --file=../output/comics.d1.data.sql
```

Verify the core reconciliation:

```bash
yarn wrangler d1 execute COMICS_DB --remote --command \
  "SELECT (SELECT COUNT(*) FROM holdings) AS holdings, (SELECT COUNT(*) FROM current_valuations) AS valuations;"
```

The expected holding count for the current migration baseline is `9572`.

## Configure production secrets

Never put these values in `wrangler.jsonc`.

Set the Zap values from the dedicated Zap session used by the local app:

```bash
yarn wrangler secret put ZAP_SUPABASE_PUBLISHABLE_KEY
yarn wrangler secret put ZAP_ACCESS_TOKEN
yarn wrangler secret put ZAP_REFRESH_TOKEN
```

Generate a high-entropy session encryption secret and store it as a Worker secret:

```bash
openssl rand -hex 32 | yarn wrangler secret put ZAP_SESSION_ENCRYPTION_KEY
```

The first production refresh seeds `provider_sessions` in D1. Subsequent rotated access/refresh token pairs are AES-GCM encrypted before being stored there. The bootstrap secrets remain a recovery seed; the D1 copy becomes the normal rotating session.

## Build and deploy

```bash
yarn check
yarn build:cloudflare
yarn deploy
```

Open the generated `workers.dev` URL and verify `/`, `/collection`, `/valuations`, and `/providers`.

On `/providers`, run **Refresh session now** once and then **Probe current API**. A successful refresh confirms the Worker can decrypt/persist the rotating Zap session.

## Security boundary

Zap credentials never need to reach browser JavaScript. Provider calls and refresh-token rotation happen server-side in the Worker. If the refresh chain is ever revoked by Zap/Supabase, replace the bootstrap Worker secrets with values from a fresh dedicated Zap login and refresh once.

## Migrate covers to R2

Create the private production bucket:

```bash
yarn wrangler r2 bucket create comics-collection-covers
```

The Worker uses the `COVERS` R2 binding declared in `wrangler.jsonc`. The bucket stays private; cover bytes are served through the existing `/covers/:key` application route.

The legacy cover directory is large enough that Cloudflare recommends `rclone` or another S3-compatible tool for bulk uploads rather than uploading one object at a time with Wrangler. Generate an R2 API access key in the Cloudflare dashboard, configure an `rclone` remote for Cloudflare R2, and use the R2 S3 endpoint for the account. Do not commit the access key or secret.

With an `rclone` remote named `r2`, upload the directory referenced by local `LEGACY_IMAGE_ROOT` without adding a path prefix:

```bash
rclone copy /absolute/path/to/legacy/images \
  r2:comics-collection-covers \
  --progress
```

Preserving the filenames at the bucket root is important because `variants.image_key` is already the application object key.

Compare the local and remote object counts after the copy:

```bash
rclone size /absolute/path/to/legacy/images
rclone size r2:comics-collection-covers
```

Deploy the Worker after the bucket exists and the binding is configured:

```bash
yarn check
yarn build:cloudflare
yarn deploy
```

Verify several comics with known covers in production. Missing R2 objects continue to return the existing SVG placeholder rather than failing the page.

## Next deployment steps

After R2 covers are reconciled:

1. protect the Worker with Cloudflare Access;
2. add a scheduled valuation refresh;
3. add production smoke checks and final reconciliation.

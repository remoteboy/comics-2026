# Cloudflare deployment

The application keeps the existing Node + local SQLite development path and has a separate Cloudflare build target for production.

## Production resources

The first deployment uses:

- Cloudflare Workers for Astro SSR
- D1 for collection/application data
- D1 for the encrypted rotating Zap session
- Worker secrets for Zap bootstrap credentials and the session-encryption key

Cover images intentionally remain placeholders in the first Worker deployment. R2 migration is a separate step so database/auth deployment can be verified independently.

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

## Next deployment steps

After the Worker + D1 deployment is reconciled:

1. migrate local covers to R2 and replace the production placeholder cover adapter;
2. protect the Worker with Cloudflare Access;
3. add a scheduled valuation refresh;
4. add production smoke checks and final reconciliation.

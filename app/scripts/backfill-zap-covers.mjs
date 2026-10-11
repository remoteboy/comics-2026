import { access, rename, rm, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

const ZAP_COVER_BASE_URL = 'https://zkc-club-covers.s3.us-east-1.amazonaws.com';

const args = new Set(process.argv.slice(2));
const write = args.has('--write');
const includeUnowned = args.has('--all');
const limitArgument = process.argv.find((arg) => arg.startsWith('--limit='));
const limit = limitArgument
  ? Number.parseInt(limitArgument.slice('--limit='.length), 10)
  : undefined;

if (limitArgument && (!Number.isInteger(limit) || limit <= 0)) {
  throw new Error('--limit must be a positive integer.');
}

const databasePath = resolve(
  process.env.COMICS_DB_PATH ?? '../output/comics.d1.sqlite',
);
const imageRoot = process.env.LEGACY_IMAGE_ROOT;

if (!imageRoot) {
  throw new Error('LEGACY_IMAGE_ROOT is not set in .env');
}

const root = resolve(imageRoot);
await access(root);

async function fileExists(path) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

function coverUrlForVariant(variantExternalId) {
  return `${ZAP_COVER_BASE_URL}/${encodeURIComponent(variantExternalId)}.jpg`;
}

function assertJpeg(bytes) {
  const valid =
    bytes.length >= 4 &&
    bytes[0] === 0xff &&
    bytes[1] === 0xd8 &&
    bytes[bytes.length - 2] === 0xff &&
    bytes[bytes.length - 1] === 0xd9;

  if (!valid) {
    throw new Error('cover response is not a valid JPEG');
  }
}

async function fetchCover(url) {
  const response = await fetch(url, { redirect: 'follow' });

  if (!response.ok) {
    throw new Error(`cover HTTP ${response.status}`);
  }

  const bytes = Buffer.from(await response.arrayBuffer());
  assertJpeg(bytes);

  return bytes;
}

async function probeCover(url) {
  await fetchCover(url);
}

async function downloadCover(url, destination) {
  const bytes = await fetchCover(url);
  const temporaryPath = `${destination}.tmp`;

  try {
    await writeFile(temporaryPath, bytes);
    await rename(temporaryPath, destination);
  } catch (error) {
    await rm(temporaryPath, { force: true });
    throw error;
  }
}

const db = new DatabaseSync(databasePath, { readOnly: true });

const rows = db
  .prepare(
    `
      SELECT
        v.id AS variantId,
        v.image_key AS imageKey,
        variant_ref.external_id AS variantExternalId,
        EXISTS (
          SELECT 1
          FROM holdings h
          WHERE h.variant_id = v.id
        ) AS owned
      FROM variants v
      LEFT JOIN external_refs variant_ref
        ON variant_ref.entity_type = 'variant'
       AND variant_ref.entity_id = v.id
       AND variant_ref.provider = 'zap'
      WHERE v.image_key IS NOT NULL
        AND v.image_key <> ''
      ORDER BY owned DESC, v.id
    `,
  )
  .all();

db.close();

const missing = [];

for (const row of rows) {
  if (!includeUnowned && !row.owned) continue;

  const destination = resolve(root, row.imageKey);

  if (dirname(destination) !== root) {
    throw new Error(`Unsafe image key for variant ${row.variantId}`);
  }

  if (!(await fileExists(destination))) {
    missing.push(row);
  }
}

const selected = limit ? missing.slice(0, limit) : missing;

let recoverable = 0;
let written = 0;
const unresolved = [];

console.log(`Mode: ${write ? 'write' : 'dry-run'}`);
console.log(
  `Scope: ${includeUnowned ? 'all variants' : 'owned variants only'}`,
);
console.log(`Missing covers in scope: ${missing.length}`);
console.log(`Selected: ${selected.length}`);

for (const row of selected) {
  if (!row.variantExternalId) {
    unresolved.push({
      row,
      reason: 'missing Zap variant external ID',
    });
    continue;
  }

  const coverUrl = coverUrlForVariant(row.variantExternalId);
  const destination = resolve(root, row.imageKey);

  try {
    if (await fileExists(destination)) continue;

    if (write) {
      await downloadCover(coverUrl, destination);
      written += 1;
    } else {
      await probeCover(coverUrl);
    }

    recoverable += 1;

    console.log(
      `${write ? 'WRITE' : 'FOUND'} variant ${row.variantId} (${row.imageKey}) <- ${coverUrl}`,
    );
  } catch (error) {
    unresolved.push({
      row,
      reason: error instanceof Error ? error.message : String(error),
    });
  }
}

console.log('');
console.log(`Recoverable: ${recoverable}`);
console.log(`Written: ${written}`);
console.log(`Unresolved: ${unresolved.length}`);

for (const { row, reason } of unresolved.slice(0, 25)) {
  console.log(`  variant ${row.variantId} (${row.imageKey}): ${reason}`);
}

if (unresolved.length > 25) {
  console.log(`  ... ${unresolved.length - 25} more unresolved`);
}

import { access, readdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

const databasePath = resolve(
  process.env.COMICS_DB_PATH ?? '../output/comics.d1.sqlite',
);
const imageRoot = process.env.LEGACY_IMAGE_ROOT;

if (!imageRoot) {
  throw new Error('LEGACY_IMAGE_ROOT is not set in .env');
}

const root = resolve(imageRoot);
await access(root);

const db = new DatabaseSync(databasePath, { readOnly: true });
const variants = db
  .prepare(
    `
    SELECT
      v.id AS variantId,
      v.image_key AS imageKey,
      EXISTS (
        SELECT 1
        FROM holdings h
        WHERE h.variant_id = v.id
      ) AS owned
    FROM variants v
    WHERE v.image_key IS NOT NULL
      AND v.image_key <> ''
    ORDER BY v.id
  `,
  )
  .all();

db.close();

let matched = 0;
const missing = [];
let ownedMissing = 0;

for (const { variantId, imageKey, owned } of variants) {
  try {
    await access(resolve(root, imageKey));
    matched += 1;
  } catch {
    missing.push({ variantId, imageKey });
    if (owned) ownedMissing += 1;
  }
}

const files = await readdir(root);

console.log(`✓ image root: ${root}`);
console.log(`✓ files in image root: ${files.length}`);
console.log(`✓ cover keys found: ${matched}/${variants.length}`);
console.log(`✓ missing cover files: ${missing.length}`);
console.log(`✓ owned missing covers: ${ownedMissing}`);

if (missing.length > 0) {
  console.log(
    `Missing keys: ${missing
      .slice(0, 10)
      .map(({ variantId, imageKey }) => `${imageKey} (variant ${variantId})`)
      .join(', ')}`,
  );
  throw new Error(
    `${missing.length} database cover keys are missing from LEGACY_IMAGE_ROOT (${ownedMissing} owned).`,
  );
}

console.log('Cover smoke check passed.');

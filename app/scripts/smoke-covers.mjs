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
  .prepare(`
    SELECT image_key AS imageKey
    FROM variants
    WHERE image_key IS NOT NULL
    ORDER BY id
    LIMIT 50
  `)
  .all();

let matched = 0;
const missing = [];

for (const { imageKey } of variants) {
  try {
    await access(resolve(root, imageKey));
    matched += 1;
  } catch {
    missing.push(imageKey);
  }
}

const files = await readdir(root);

console.log(`✓ image root: ${root}`);
console.log(`✓ files in image root: ${files.length}`);
console.log(`✓ sampled cover keys found: ${matched}/${variants.length}`);

if (missing.length > 0) {
  console.log(`Missing sample keys: ${missing.slice(0, 10).join(', ')}`);
}

if (matched === 0) {
  throw new Error(
    'No sampled database image keys exist in LEGACY_IMAGE_ROOT; check the directory or legacy filename convention.',
  );
}

console.log('Cover smoke check passed.');

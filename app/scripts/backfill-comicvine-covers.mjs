import {
  access,
  mkdtemp,
  readFile,
  rename,
  rm,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { spawn } from 'node:child_process';
import { DatabaseSync } from 'node:sqlite';

const args = new Set(process.argv.slice(2));
const write = args.has('--write');
const limitArgument = process.argv.find((arg) => arg.startsWith('--limit='));
const limit = limitArgument
  ? Number.parseInt(limitArgument.slice('--limit='.length), 10)
  : undefined;

if (limitArgument && (!Number.isInteger(limit) || limit <= 0)) {
  throw new Error('--limit must be a positive integer.');
}

const apiKey = process.env.COMIC_VINE_API_KEY;
const imageRoot = process.env.LEGACY_IMAGE_ROOT;
const databasePath = resolve(
  process.env.COMICS_DB_PATH ?? '../output/comics.d1.sqlite',
);

if (!apiKey) throw new Error('COMIC_VINE_API_KEY is not set in .env');
if (!imageRoot) throw new Error('LEGACY_IMAGE_ROOT is not set in .env');

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

function imageFormat(bytes) {
  if (bytes.length >= 4 && bytes[0] === 0xff && bytes[1] === 0xd8) {
    return 'jpeg';
  }

  if (
    bytes.length >= 8 &&
    bytes.subarray(0, 8).equals(Buffer.from('89504e470d0a1a0a', 'hex'))
  ) {
    return 'png';
  }

  if (
    bytes.length >= 12 &&
    bytes.toString('ascii', 0, 4) === 'RIFF' &&
    bytes.toString('ascii', 8, 12) === 'WEBP'
  ) {
    return 'webp';
  }

  return null;
}

async function fetchImage(url) {
  const parsed = new URL(url);

  if (
    parsed.protocol !== 'https:' ||
    parsed.hostname !== 'comicvine.gamespot.com'
  ) {
    throw new Error('Unexpected Comic Vine image host');
  }

  const response = await fetch(url, { redirect: 'follow' });

  if (!response.ok) {
    throw new Error(`image HTTP ${response.status}`);
  }

  const bytes = Buffer.from(await response.arrayBuffer());
  const format = imageFormat(bytes);

  if (!format) {
    throw new Error('image response is not JPEG, PNG, or WebP');
  }

  return { bytes, format };
}

async function fetchIssue(issueId) {
  const url = new URL(
    `https://comicvine.gamespot.com/api/issue/4000-${issueId}/`,
  );

  url.searchParams.set('api_key', apiKey);
  url.searchParams.set('format', 'json');
  url.searchParams.set('field_list', 'id,name,issue_number,image');

  const response = await fetch(url, {
    headers: {
      'User-Agent': 'ComicsCollection/1.0',
      accept: 'application/json',
    },
  });

  if (!response.ok) {
    throw new Error(`Comic Vine API HTTP ${response.status}`);
  }

  const payload = await response.json();

  if (payload.status_code !== 1 || !payload.results) {
    throw new Error(`Comic Vine API: ${payload.error ?? 'unknown error'}`);
  }

  if (String(payload.results.id) !== issueId) {
    throw new Error('Comic Vine returned a different issue ID');
  }

  const image = payload.results.image;
  const urlValue = image?.original_url ?? image?.super_url;

  if (typeof urlValue !== 'string' || !urlValue) {
    throw new Error('Comic Vine issue has no cover image URL');
  }

  return urlValue;
}

async function runSips(source, destination) {
  await new Promise((resolvePromise, reject) => {
    const child = spawn(
      'sips',
      ['-s', 'format', 'jpeg', source, '--out', destination],
      { stdio: 'ignore' },
    );

    child.on('error', reject);

    child.on('close', (code) =>
      code === 0
        ? resolvePromise()
        : reject(new Error(`sips failed with exit code ${code}`)),
    );
  });
}

async function saveJpeg({ bytes, format }, destination) {
  const directory = await mkdtemp(join(tmpdir(), 'comicvine-cover-'));
  const source = join(
    directory,
    `source.${format === 'jpeg' ? 'jpg' : format}`,
  );
  const converted = join(directory, 'converted.jpg');
  const staged = `${destination}.tmp`;

  try {
    if (format === 'jpeg') {
      if (
        bytes[bytes.length - 2] !== 0xff ||
        bytes[bytes.length - 1] !== 0xd9
      ) {
        throw new Error('JPEG is incomplete');
      }

      await writeFile(staged, bytes, { flag: 'wx' });
    } else {
      await writeFile(source, bytes);
      await runSips(source, converted);

      const jpeg = await readFile(converted);

      if (imageFormat(jpeg) !== 'jpeg') {
        throw new Error('Converted image is not JPEG');
      }

      await writeFile(staged, jpeg, { flag: 'wx' });
    }

    if (await fileExists(destination)) {
      throw new Error('Destination already exists');
    }

    await rename(staged, destination);
  } finally {
    await rm(staged, { force: true });
    await rm(directory, { recursive: true, force: true });
  }
}

const db = new DatabaseSync(databasePath, { readOnly: true });

let rows;

try {
  rows = db
    .prepare(
      `
        SELECT
          v.id AS variantId,
          v.image_key AS imageKey,
          er.external_id AS externalId
        FROM variants v
        JOIN external_refs er
          ON er.entity_type = 'variant'
         AND er.entity_id = v.id
         AND er.provider = 'comic_vine'
        WHERE v.image_key LIKE '4000-%-0.jpg'
        ORDER BY v.id
      `,
    )
    .all();
} finally {
  db.close();
}

const missing = [];

for (const row of rows) {
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
console.log(`Missing Comic Vine covers: ${missing.length}`);
console.log(`Selected: ${selected.length}`);

for (const row of selected) {
  const match = /^4000-(\d+)-0$/.exec(row.externalId ?? '');

  if (!match || `${row.externalId}.jpg` !== row.imageKey) {
    unresolved.push({
      row,
      reason: 'Comic Vine reference does not match image key',
    });

    continue;
  }

  try {
    const url = await fetchIssue(match[1]);
    const image = await fetchImage(url);
    const destination = resolve(root, row.imageKey);

    if (await fileExists(destination)) continue;

    if (write) {
      await saveJpeg(image, destination);
      written += 1;
    }

    recoverable += 1;

    console.log(
      `${write ? 'WRITE' : 'FOUND'} variant ${row.variantId} (${row.imageKey}) [${image.format}]`,
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

for (const { row, reason } of unresolved) {
  console.log(`  variant ${row.variantId} (${row.imageKey}): ${reason}`);
}

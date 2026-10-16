import { DatabaseSync, backup } from 'node:sqlite';
import { createHash, randomUUID } from 'node:crypto';
import {
  mkdirSync,
  readFileSync,
  writeFileSync,
  existsSync,
  copyFileSync,
  renameSync,
  rmSync,
  realpathSync,
  lstatSync,
  constants,
} from 'node:fs';
import { resolve, join, dirname, sep } from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const appRoot = fileURLToPath(new URL('../../', import.meta.url));
const digest = (path) =>
  createHash('sha256').update(readFileSync(path)).digest('hex');
const keyValid = (key) =>
  typeof key === 'string' &&
  /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,250}$/.test(key) &&
  !key.includes('..');
export function runWrangler(args) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(
      process.execPath,
      [join(appRoot, 'node_modules/wrangler/bin/wrangler.js'), ...args],
      { cwd: appRoot, stdio: ['ignore', 'pipe', 'pipe'] },
    );
    let output = '';
    const capture = (chunk) => {
      output = (output + String(chunk)).slice(-1024 * 1024);
    };
    child.stdout.on('data', capture);
    child.stderr.on('data', capture);
    const timer = setTimeout(() => child.kill('SIGTERM'), 300000);
    child.once('error', () => {
      clearTimeout(timer);
      reject(
        new Error(
          'Could not start Wrangler. Install the project dependencies first.',
        ),
      );
    });
    child.once('close', (code) => {
      clearTimeout(timer);
      if (code === 0) {
        resolvePromise();
        return;
      }
      const missing =
        /404|object does not exist|object not found|specified key does not exist/i.test(
          output,
        );
      const error = new Error(
        missing
          ? 'Cover object not found.'
          : 'Cloudflare command failed. Check Wrangler login, permissions and network access.',
      );
      error.code = missing ? 'MISSING_COVER' : 'CLOUDFLARE_ERROR';
      reject(error);
    });
  });
}
export function inspectDatabase(path) {
  const db = new DatabaseSync(path, { readOnly: true });
  try {
    const integrity = db.prepare('PRAGMA integrity_check').all();
    if (integrity.length !== 1 || Object.values(integrity[0])[0] !== 'ok')
      throw new Error('Database integrity check failed.');
    if (db.prepare('PRAGMA foreign_key_check').all().length)
      throw new Error('Database foreign key check failed.');
    const tables = db
      .prepare(
        "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name",
      )
      .all();
    const counts = {};
    for (const { name } of tables)
      counts[name] = db
        .prepare(`SELECT COUNT(*) AS n FROM "${name.replaceAll('"', '""')}"`)
        .get().n;
    for (const required of [
      'series',
      'issues',
      'variants',
      'holdings',
      'price_snapshots',
    ])
      if (!(required in counts))
        throw new Error('This is not a complete comics database.');
    const totals = db
      .prepare(
        'SELECT COALESCE(SUM(quantity),0) AS copies,COALESCE(SUM(quantity * COALESCE(current_value_cents,0)),0) AS valueCents FROM holdings',
      )
      .get();
    const covers = db
      .prepare(
        "SELECT DISTINCT image_key AS key FROM variants WHERE image_key IS NOT NULL AND TRIM(image_key) NOT IN ('','NULL','null') ORDER BY image_key",
      )
      .all()
      .map((row) => row.key);
    if (covers.some((key) => !keyValid(key)))
      throw new Error(
        'A cover key is unsafe for file export. Correct it before creating a complete backup.',
      );
    return { counts, totals, covers };
  } finally {
    db.close();
  }
}
function plainFile(path) {
  if (!lstatSync(path).isFile() || lstatSync(path).isSymbolicLink())
    throw new Error('Backup files must be ordinary files, not links.');
}
export async function createCollectionBackup(options) {
  const {
    remote = false,
    databasePath,
    coversRoots = [],
    output,
    bucket,
    allowMissingCovers = false,
    databaseOnly = false,
    command = runWrangler,
    onProgress = () => {},
  } = options;
  if (!output || (remote ? !bucket && !databaseOnly : !databasePath))
    throw new Error(
      'Supply output, database source and cover source (or explicitly choose database-only).',
    );
  const destination = resolve(output);
  if (existsSync(destination))
    throw new Error(
      'Backup destination already exists; choose a new directory.',
    );
  mkdirSync(dirname(destination), { recursive: true, mode: 0o700 });
  const staging = destination + '.partial-' + randomUUID();
  mkdirSync(staging, { mode: 0o700 });
  mkdirSync(join(staging, 'covers'), { mode: 0o700 });
  try {
    const snapshot = join(staging, 'comics.sqlite');
    if (remote) {
      const sqlPath = join(staging, 'database.sql');
      onProgress('Exporting the production database…');
      await command([
        'd1',
        'export',
        'COMICS_DB',
        '--remote',
        '--yes',
        '--config',
        'wrangler.jsonc',
        '--output',
        sqlPath,
      ]);
      const db = new DatabaseSync(snapshot);
      try {
        db.exec('PRAGMA foreign_keys=OFF');
        db.exec(readFileSync(sqlPath, 'utf8'));
      } finally {
        db.close();
      }
    } else {
      const source = new DatabaseSync(resolve(databasePath), {
        readOnly: true,
      });
      try {
        await backup(source, snapshot);
      } finally {
        source.close();
      }
    }
    const state = inspectDatabase(snapshot);
    const covers = [];
    const missing = [];
    let completed = 0;
    async function copyCover(key) {
      if (databaseOnly) {
        missing.push(key);
        return;
      }
      const target = join(staging, 'covers', key);
      let found = false;
      if (remote) {
        try {
          await command([
            'r2',
            'object',
            'get',
            `${bucket}/${key}`,
            '--remote',
            '--config',
            'wrangler.jsonc',
            '--file',
            target,
          ]);
          found = true;
        } catch (error) {
          if (error.code !== 'MISSING_COVER') throw error;
        }
      } else
        for (const root of coversRoots) {
          const path = join(resolve(root), key);
          if (!existsSync(path)) continue;
          const canonicalRoot = realpathSync(root);
          if (!realpathSync(path).startsWith(canonicalRoot + sep))
            throw new Error(
              'Cover file escapes its configured source directory.',
            );
          copyFileSync(path, target, constants.COPYFILE_EXCL);
          found = true;
          break;
        }
      if (!found) {
        missing.push(key);
        if (!allowMissingCovers)
          throw new Error(
            `Cover ${key} is missing. Restore it first, or explicitly allow missing covers.`,
          );
      } else {
        plainFile(target);
        covers.push({ key, sha256: digest(target) });
      }
    }
    let index = 0;
    let stopped = false;
    const workers = await Promise.allSettled(
      Array.from({ length: Math.min(4, state.covers.length) }, async () => {
        while (!stopped && index < state.covers.length) {
          const key = state.covers[index++];
          try {
            await copyCover(key);
            completed++;
            if (completed % 25 === 0 || completed === state.covers.length)
              onProgress(
                `Backed up ${completed}/${state.covers.length} referenced covers.`,
              );
          } catch (error) {
            stopped = true;
            throw error;
          }
        }
      }),
    );
    for (const outcome of workers)
      if (outcome.status === 'rejected') throw outcome.reason;
    covers.sort((a, b) => a.key.localeCompare(b.key));
    missing.sort();
    const manifest = {
      version: 1,
      createdAt: new Date().toISOString(),
      source: remote ? 'cloudflare' : 'local',
      coverage: databaseOnly
        ? 'database-only'
        : missing.length
          ? 'missing-covers'
          : 'complete',
      databaseSha256: digest(snapshot),
      sqlSha256: remote ? digest(join(staging, 'database.sql')) : null,
      counts: state.counts,
      totals: state.totals,
      covers,
      missingCovers: missing,
    };
    writeFileSync(
      join(staging, 'manifest.json'),
      JSON.stringify(manifest, null, 2) + '\n',
      { mode: 0o600, flag: 'wx' },
    );
    verifyCollectionBackup(staging, {
      allowMissingCovers: allowMissingCovers || databaseOnly,
    });
    if (existsSync(destination))
      throw new Error(
        'Destination appeared during backup; nothing was overwritten.',
      );
    renameSync(staging, destination);
    return { path: destination, manifest };
  } catch (error) {
    rmSync(staging, { recursive: true, force: true });
    throw error;
  }
}
export function verifyCollectionBackup(
  directory,
  { allowMissingCovers = false } = {},
) {
  const root = resolve(directory);
  plainFile(join(root, 'manifest.json'));
  const manifest = JSON.parse(
    readFileSync(join(root, 'manifest.json'), 'utf8'),
  );
  if (
    manifest.version !== 1 ||
    !Array.isArray(manifest.covers) ||
    !Array.isArray(manifest.missingCovers)
  )
    throw new Error('Invalid backup manifest.');
  const snapshot = join(root, 'comics.sqlite');
  plainFile(snapshot);
  if (digest(snapshot) !== manifest.databaseSha256)
    throw new Error('Database checksum mismatch.');
  if (manifest.sqlSha256) {
    plainFile(join(root, 'database.sql'));
    if (digest(join(root, 'database.sql')) !== manifest.sqlSha256)
      throw new Error('SQL checksum mismatch.');
  }
  const state = inspectDatabase(snapshot);
  if (
    JSON.stringify(state.counts) !== JSON.stringify(manifest.counts) ||
    JSON.stringify(state.totals) !== JSON.stringify(manifest.totals)
  )
    throw new Error('Database counts or totals do not match the manifest.');
  const keys = new Set();
  for (const cover of manifest.covers) {
    if (!keyValid(cover.key) || keys.has(cover.key))
      throw new Error('Invalid or duplicate cover key.');
    keys.add(cover.key);
    const path = join(root, 'covers', cover.key);
    plainFile(path);
    if (
      !realpathSync(path).startsWith(realpathSync(join(root, 'covers')) + sep)
    )
      throw new Error('Cover escapes backup directory.');
    if (digest(path) !== cover.sha256)
      throw new Error('Cover checksum mismatch.');
  }
  for (const key of manifest.missingCovers) {
    if (!keyValid(key) || keys.has(key))
      throw new Error('Invalid missing cover list.');
    keys.add(key);
  }
  if (
    keys.size !== state.covers.length ||
    state.covers.some((key) => !keys.has(key))
  )
    throw new Error('Cover manifest does not match database references.');
  if (manifest.missingCovers.length && !allowMissingCovers)
    throw new Error(
      'This backup has missing covers. Explicit acknowledgement is required.',
    );
  return manifest;
}
export function restoreCollectionBackup(directory, output, options = {}) {
  if (!output) throw new Error('Supply a new restore directory.');
  const destination = resolve(output);
  if (existsSync(destination))
    throw new Error(
      'Restore destination already exists. Live data will not be overwritten.',
    );
  const manifest = verifyCollectionBackup(directory, options);
  mkdirSync(dirname(destination), { recursive: true, mode: 0o700 });
  const staging = destination + '.partial-' + randomUUID();
  mkdirSync(staging, { mode: 0o700 });
  try {
    mkdirSync(join(staging, 'covers'), { mode: 0o700 });
    copyFileSync(
      join(directory, 'comics.sqlite'),
      join(staging, 'comics.sqlite'),
      constants.COPYFILE_EXCL,
    );
    for (const { key } of manifest.covers)
      copyFileSync(
        join(directory, 'covers', key),
        join(staging, 'covers', key),
        constants.COPYFILE_EXCL,
      );
    if (digest(join(staging, 'comics.sqlite')) !== manifest.databaseSha256)
      throw new Error('Restored database checksum mismatch.');
    for (const { key, sha256 } of manifest.covers)
      if (digest(join(staging, 'covers', key)) !== sha256)
        throw new Error('Restored cover checksum mismatch.');
    inspectDatabase(join(staging, 'comics.sqlite'));
    if (existsSync(destination))
      throw new Error('Restore destination appeared; nothing was overwritten.');
    renameSync(staging, destination);
    return destination;
  } catch (error) {
    rmSync(staging, { recursive: true, force: true });
    throw error;
  }
}

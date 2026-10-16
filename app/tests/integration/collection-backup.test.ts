import {
  mkdtempSync,
  readFileSync,
  readdirSync,
  writeFileSync,
  mkdirSync,
  existsSync,
  rmSync,
  symlinkSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { beforeEach, afterEach, describe, expect, it } from 'vitest';
import {
  createCollectionBackup,
  verifyCollectionBackup,
  restoreCollectionBackup,
} from '../../scripts/lib/collection-backup.mjs';
let root: string;
let source: string;
let covers: string;
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'comics-backup-'));
  source = join(root, 'source.sqlite');
  covers = join(root, 'original-covers');
  mkdirSync(covers);
  const db = new DatabaseSync(source);
  const directory = new URL('../../../d1/migrations/', import.meta.url);
  for (const name of readdirSync(directory)
    .filter((name) => name.endsWith('.sql'))
    .sort())
    db.exec(readFileSync(new URL(name, directory), 'utf8'));
  db.exec(
    readFileSync(new URL('../fixtures/test-data.sql', import.meta.url), 'utf8'),
  );
  db.close();
  for (let i = 1; i <= 5; i++)
    writeFileSync(join(covers, `${i}.jpg`), `original-cover-${i}`);
});
afterEach(() => rmSync(root, { recursive: true, force: true }));
const create = (overrides = {}) =>
  createCollectionBackup({
    databasePath: source,
    coversRoots: [covers],
    output: join(root, 'backup'),
    ...overrides,
  });
describe('collection backup and restore', () => {
  it('bounds remote cover downloads and waits for in-flight requests before cleaning a failed backup', async () => {
    let active = 0;
    let maximum = 0;
    const command = async (args: string[]) => {
      if (args.includes('export')) {
        const sql = [
          'CREATE TABLE series(id INTEGER);',
          'CREATE TABLE issues(id INTEGER);',
          'CREATE TABLE price_snapshots(id INTEGER);',
          'CREATE TABLE holdings(quantity INTEGER,current_value_cents INTEGER);',
          'CREATE TABLE variants(image_key TEXT);',
          ...Array.from(
            { length: 5 },
            (_, i) => `INSERT INTO variants VALUES('${i + 1}.jpg');`,
          ),
        ].join('\n');
        writeFileSync(args[args.indexOf('--output') + 1], sql);
        return;
      }
      active++;
      maximum = Math.max(maximum, active);
      try {
        if (args.includes('covers-test/2.jpg')) {
          await new Promise((resolve) => setTimeout(resolve, 1));
          throw new Error('Network failed');
        }
        await new Promise((resolve) => setTimeout(resolve, 10));
        writeFileSync(args[args.indexOf('--file') + 1], 'cover');
      } finally {
        active--;
      }
    };
    await expect(
      createCollectionBackup({
        remote: true,
        bucket: 'covers-test',
        output: join(root, 'failed'),
        command,
      }),
    ).rejects.toThrow('Network failed');
    expect(active).toBe(0);
    expect(maximum).toBeLessThanOrEqual(4);
    expect(maximum).toBeGreaterThan(1);
    expect(readdirSync(root).some((name) => name.includes('.partial-'))).toBe(
      false,
    );
  });
  it('round-trips the database, every reference, purchase/history record and cover into a fresh directory', async () => {
    const result = await create();
    expect(result.manifest.coverage).toBe('complete');
    expect(result.manifest.totals).toEqual({ copies: 6, valueCents: 7500 });
    verifyCollectionBackup(result.path);
    const output = restoreCollectionBackup(result.path, join(root, 'restored'));
    const db = new DatabaseSync(join(output, 'comics.sqlite'));
    expect(
      db
        .prepare(
          'SELECT quantity,purchase_price_cents AS price FROM holdings WHERE id=1',
        )
        .get(),
    ).toEqual({ quantity: 2, price: 400 });
    expect(
      db.prepare('SELECT COUNT(*) AS count FROM price_snapshots').get()?.count,
    ).toBe(4);
    expect(db.prepare('PRAGMA foreign_key_check').all()).toEqual([]);
    db.close();
    expect(readFileSync(join(output, 'covers', '1.jpg'), 'utf8')).toBe(
      'original-cover-1',
    );
    expect(readFileSync(join(output, 'comics.sqlite'))).toEqual(
      readFileSync(join(result.path, 'comics.sqlite')),
    );
  });
  it('refuses corrupted files and existing destinations without overwriting them', async () => {
    const result = await create();
    mkdirSync(join(root, 'existing'));
    writeFileSync(join(root, 'existing', 'keep'), 'untouched');
    expect(() =>
      restoreCollectionBackup(result.path, join(root, 'existing')),
    ).toThrow('already exists');
    writeFileSync(join(result.path, 'covers', '1.jpg'), 'corrupted');
    expect(() =>
      restoreCollectionBackup(result.path, join(root, 'restored')),
    ).toThrow('checksum');
    expect(existsSync(join(root, 'restored'))).toBe(false);
    expect(readFileSync(join(root, 'existing', 'keep'), 'utf8')).toBe(
      'untouched',
    );
  });
  it('records missing covers explicitly and requires acknowledgement at both backup and restore', async () => {
    rmSync(join(covers, '1.jpg'));
    await expect(create()).rejects.toThrow('missing');
    expect(existsSync(join(root, 'backup'))).toBe(false);
    const result = await create({ allowMissingCovers: true });
    expect(result.manifest.coverage).toBe('missing-covers');
    expect(result.manifest.missingCovers).toEqual(['1.jpg']);
    expect(() => verifyCollectionBackup(result.path)).toThrow(
      'acknowledgement',
    );
    restoreCollectionBackup(result.path, join(root, 'restored'), {
      allowMissingCovers: true,
    });
  });
  it('rejects references that could escape the cover directory and symlinked backup files', async () => {
    const db = new DatabaseSync(source);
    db.prepare('UPDATE variants SET image_key=? WHERE id=1').run('../private');
    db.close();
    await expect(create()).rejects.toThrow('unsafe');
    const fixed = new DatabaseSync(source);
    fixed.exec("UPDATE variants SET image_key='1.jpg' WHERE id=1");
    fixed.close();
    const result = await create();
    rmSync(join(result.path, 'covers', '1.jpg'));
    symlinkSync(join(covers, '1.jpg'), join(result.path, 'covers', '1.jpg'));
    expect(() => verifyCollectionBackup(result.path)).toThrow('ordinary files');
  });
  it('uses explicit remote export/download commands and verifies the imported SQL before backup is marked complete', async () => {
    const commands: string[][] = [];
    const command = async (args: string[]) => {
      commands.push(args);
      const file =
        args[args.indexOf(args.includes('export') ? '--output' : '--file') + 1];
      if (args.includes('export')) {
        const tables = [
          'series',
          'issues',
          'variants',
          'holdings',
          'price_snapshots',
        ];
        writeFileSync(
          file,
          tables
            .map((table) =>
              table === 'variants'
                ? "CREATE TABLE variants(id INTEGER PRIMARY KEY,image_key TEXT);INSERT INTO variants VALUES(1,'1.jpg');"
                : table === 'holdings'
                  ? 'CREATE TABLE holdings(id INTEGER,quantity INTEGER,current_value_cents INTEGER);INSERT INTO holdings VALUES(1,2,1000);'
                  : `CREATE TABLE ${table}(id INTEGER);INSERT INTO ${table} VALUES(1);`,
            )
            .join('\n'),
        );
      } else writeFileSync(file, 'remote-cover');
    };
    const result = await createCollectionBackup({
      remote: true,
      output: join(root, 'remote-backup'),
      bucket: 'covers-test',
      command,
    });
    expect(commands[0]).toContain('--remote');
    expect(commands[1]).toContain('covers-test/1.jpg');
    expect(result.manifest.sqlSha256).toMatch(/^[0-9a-f]{64}$/);
    const restored = restoreCollectionBackup(
      result.path,
      join(root, 'restored'),
    );
    expect(readFileSync(join(restored, 'covers', '1.jpg'), 'utf8')).toBe(
      'remote-cover',
    );
  });
});

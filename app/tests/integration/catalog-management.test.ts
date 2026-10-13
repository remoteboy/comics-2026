import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  createTestDatabase,
  type TestDatabase,
} from '../helpers/test-database';
import {
  changeCatalog,
  getCatalogRecord,
  listCatalog,
  catalogAliases,
  catalogComics,
  catalogRedirect,
  catalogIdentitySql,
} from '@/features/catalog/repository';
import { searchCollection } from '@/features/search/repository';
import { saveIntake } from '@/features/intake/save';
import {
  getEditableMetadata,
  saveMetadata,
} from '@/features/collection/metadata-edit';
import { listSeries } from '@/features/collection/series.repository';
import { intakeInput } from '../helpers/intake-fixtures';
describe('creator and publisher consolidation', () => {
  let db: TestDatabase;
  beforeEach(() => {
    db = createTestDatabase();
  });
  afterEach(() => db.close());
  const rename = (
    kind: 'creator' | 'publisher',
    id: number,
    name: string,
    version = 0,
  ) =>
    changeCatalog(
      {
        requestId: crypto.randomUUID(),
        kind,
        id,
        version,
        action: 'rename',
        name,
      },
      db,
    );
  it('counts covers and copies once even with several roles', async () => {
    await db.run(
      "INSERT INTO variant_credits(variant_id,creator_id,role) VALUES(1,1,'inker')",
    );
    expect(await getCatalogRecord('creator', 1, db)).toMatchObject({
      comicCount: 1,
      copyCount: 2,
    });
    expect((await catalogComics('creator', 1, 1, db)).items[0].roles).toContain(
      'inker',
    );
    expect((await listCatalog('creator', 'Jane', 1, db)).total).toBe(1);
    expect((await listCatalog('creator', '%_', 1, db)).total).toBe(0);
  });
  it('renames with aliases, increments affected comic revisions, and replays safely', async () => {
    const input = {
      requestId: crypto.randomUUID(),
      kind: 'creator' as const,
      id: 1,
      version: 0,
      action: 'rename' as const,
      name: 'Jane Canonical',
    };
    await changeCatalog(input, db);
    await changeCatalog(input, db);
    expect(await catalogAliases('creator', 1, db)).toEqual([
      { name: 'Jane Writer' },
    ]);
    expect(await getCatalogRecord('creator', 1, db)).toMatchObject({
      name: 'Jane Canonical',
      editVersion: 1,
    });
    expect((await getEditableMetadata(1, db))?.editVersion).toBe(1);
    expect((await searchCollection('Jane Writer', db))[0]).toMatchObject({
      label: 'Jane Canonical',
      href: '/creators/1',
    });
    expect(
      (await listSeries({ query: 'Jane Writer', page: 1 }, db)).items.map(
        (item) => item.id,
      ),
    ).toContain(1);
    await expect(
      changeCatalog({ ...input, name: 'Another Name' }, db),
    ).rejects.toThrow('already used');
    await expect(rename('creator', 1, 'Other')).rejects.toThrow('changed');
  });
  it('merges duplicate creators while preserving roles, holdings and old links', async () => {
    await db.run("INSERT INTO creators(id,name) VALUES(4,'J. Writer')");
    await db.run(
      "INSERT INTO variant_credits(variant_id,creator_id,role) VALUES(1,4,'writer'),(1,4,'inker'),(2,4,'writer')",
    );
    const before = await db.all('SELECT * FROM holdings ORDER BY id');
    const input = {
      requestId: crypto.randomUUID(),
      kind: 'creator' as const,
      id: 4,
      version: 0,
      action: 'merge' as const,
      targetId: 1,
      targetVersion: 0,
      confirmed: true,
    };
    await changeCatalog(input, db);
    await changeCatalog(input, db);
    expect(await getCatalogRecord('creator', 4, db)).toBeUndefined();
    expect(await catalogRedirect('creator', 4, db)).toBe(1);
    expect(
      await db.all(
        'SELECT role FROM variant_credits WHERE variant_id=1 AND creator_id=1 ORDER BY role',
      ),
    ).toEqual([{ role: 'inker' }, { role: 'writer' }]);
    expect(await db.all('SELECT * FROM holdings ORDER BY id')).toEqual(before);
    expect(await db.get(catalogIdentitySql('creator'), ['J. Writer'])).toEqual({
      id: 1,
    });
  });
  it('merges publishers without changing purchase or price history', async () => {
    await db.run("INSERT INTO publishers(id,name) VALUES(3,'DC')");
    await db.run('UPDATE variants SET publisher_id=3 WHERE id=2');
    const history = await db.all('SELECT * FROM price_snapshots ORDER BY id');
    await changeCatalog(
      {
        requestId: crypto.randomUUID(),
        kind: 'publisher',
        id: 3,
        version: 0,
        action: 'merge',
        targetId: 1,
        targetVersion: 0,
        confirmed: true,
      },
      db,
    );
    expect((await getEditableMetadata(2, db))?.publisherName).toBe('DC Comics');
    expect(await catalogRedirect('publisher', 3, db)).toBe(1);
    expect(await db.all('SELECT * FROM price_snapshots ORDER BY id')).toEqual(
      history,
    );
  });
  it('future intake and comic edits reuse renamed creator and publisher aliases', async () => {
    await rename('creator', 1, 'Jane Canonical');
    await rename('publisher', 1, 'DC Canonical');
    const input = intakeInput();
    input.manualMetadata!.credits.push({
      name: 'Jane Canonical',
      role: 'writer',
    });
    const saved = await saveIntake(input, undefined, { db });
    const metadata = await getEditableMetadata(saved.variantId, db);
    expect(metadata).toMatchObject({ publisherName: 'DC Canonical' });
    expect(metadata?.credits).toEqual([
      { name: 'Jane Canonical', role: 'writer' },
    ]);
    await saveMetadata(
      {
        ...input.manualMetadata!,
        requestId: crypto.randomUUID(),
        variantId: saved.variantId,
        expectedVersion: metadata!.editVersion,
      },
      undefined,
      db,
    );
    expect((await getEditableMetadata(saved.variantId, db))?.credits).toEqual([
      { name: 'Jane Canonical', role: 'writer' },
    ]);
    expect(
      await db.get('SELECT COUNT(*) AS n FROM creators WHERE name=?', [
        'Jane Writer',
      ]),
    ).toEqual({ n: 0 });
    expect(
      await db.get('SELECT COUNT(*) AS n FROM publishers WHERE name=?', [
        'DC Comics',
      ]),
    ).toEqual({ n: 0 });
  });
  it('rejects unconfirmed merges, stale targets and names owned by another record', async () => {
    const input = {
      requestId: crypto.randomUUID(),
      kind: 'creator' as const,
      id: 2,
      version: 0,
      action: 'merge' as const,
      targetId: 1,
      targetVersion: 0,
    };
    await expect(changeCatalog(input, db)).rejects.toThrow('Confirm');
    await rename('creator', 1, 'Jane Canonical');
    await expect(
      changeCatalog({ ...input, confirmed: true }, db),
    ).rejects.toThrow('record to keep changed');
    await expect(rename('creator', 2, 'Jane Writer')).rejects.toThrow(
      'another record',
    );
    await expect(rename('publisher', 1, 'NULL')).rejects.toThrow(
      'Enter a name',
    );
  });
  it('rolls back all changes when a credit transfer fails', async () => {
    await db.run("INSERT INTO creators(id,name) VALUES(4,'J. Writer')");
    await db.run(
      "INSERT INTO variant_credits(variant_id,creator_id,role) VALUES(2,4,'writer')",
    );
    await db.run(
      "CREATE TRIGGER fail_merge BEFORE UPDATE OF creator_id ON variant_credits BEGIN SELECT RAISE(ABORT,'forced failure'); END",
    );
    await expect(
      changeCatalog(
        {
          requestId: crypto.randomUUID(),
          kind: 'creator',
          id: 4,
          version: 0,
          action: 'merge',
          targetId: 1,
          targetVersion: 0,
          confirmed: true,
        },
        db,
      ),
    ).rejects.toThrow('changed');
    expect(await getCatalogRecord('creator', 4, db)).toMatchObject({
      editVersion: 0,
    });
    expect(
      await db.get('SELECT edit_version AS version FROM variants WHERE id=2'),
    ).toEqual({ version: 0 });
    expect(await db.get('SELECT COUNT(*) AS n FROM catalog_changes')).toEqual({
      n: 0,
    });
  });
  it('moves old aliases and redirects through repeated merges', async () => {
    await db.run("INSERT INTO creators(id,name) VALUES(4,'J. Writer')");
    await rename('creator', 4, 'Jane Duplicate');
    await changeCatalog(
      {
        requestId: crypto.randomUUID(),
        kind: 'creator',
        id: 4,
        version: 1,
        action: 'merge',
        targetId: 1,
        targetVersion: 0,
        confirmed: true,
      },
      db,
    );
    await changeCatalog(
      {
        requestId: crypto.randomUUID(),
        kind: 'creator',
        id: 1,
        version: 1,
        action: 'merge',
        targetId: 2,
        targetVersion: 0,
        confirmed: true,
      },
      db,
    );
    expect(await catalogRedirect('creator', 4, db)).toBe(2);
    expect(await db.get(catalogIdentitySql('creator'), ['J. Writer'])).toEqual({
      id: 2,
    });
    expect(
      await db.get(catalogIdentitySql('creator'), ['Jane Writer']),
    ).toEqual({ id: 2 });
  });
  it('global search labels types and finds canonical and alias names', async () => {
    expect(await searchCollection('Jane', db)).toContainEqual({
      label: 'Jane Writer',
      detail: 'Creator · 1 covers',
      href: '/creators/1',
    });
    expect(await searchCollection('DC', db)).toContainEqual(
      expect.objectContaining({ label: 'DC Comics', href: '/publishers/1' }),
    );
    await rename('publisher', 1, 'DC Canonical');
    expect((await searchCollection('DC Comics', db))[0]).toMatchObject({
      label: 'DC Canonical',
      href: '/publishers/1',
    });
  });
  it('guards against a rename racing the atomic batch', async () => {
    const original = db.batch.bind(db);
    db.batch = async (statements) => {
      await db.run(
        'UPDATE creators SET edit_version=edit_version+1 WHERE id=1',
      );
      return original(statements);
    };
    await expect(rename('creator', 1, 'Race')).rejects.toThrow('changed');
    expect((await getCatalogRecord('creator', 1, db))?.name).toBe(
      'Jane Writer',
    );
    expect(await catalogAliases('creator', 1, db)).toEqual([]);
    expect(
      await db.get('SELECT edit_version AS version FROM variants WHERE id=1'),
    ).toEqual({ version: 0 });
  });
  it('can consolidate a group with three case-variant duplicate names', async () => {
    await db.run(
      "INSERT INTO creators(id,name) VALUES(4,'JANE WRITER'),(5,'jane writer')",
    );
    await changeCatalog(
      {
        requestId: crypto.randomUUID(),
        kind: 'creator',
        id: 4,
        version: 0,
        action: 'merge',
        targetId: 1,
        targetVersion: 0,
        confirmed: true,
      },
      db,
    );
    await changeCatalog(
      {
        requestId: crypto.randomUUID(),
        kind: 'creator',
        id: 5,
        version: 0,
        action: 'merge',
        targetId: 1,
        targetVersion: 1,
        confirmed: true,
      },
      db,
    );
    expect(
      await db.get(
        'SELECT COUNT(*) AS n FROM creators WHERE name=? COLLATE NOCASE',
        ['Jane Writer'],
      ),
    ).toEqual({ n: 1 });
    expect(
      await db.get(catalogIdentitySql('creator'), ['JANE WRITER']),
    ).toEqual({ id: 1 });
  });
});

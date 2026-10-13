import { beforeEach, afterEach, describe, expect, it } from 'vitest';
import {
  createTestDatabase,
  type TestDatabase,
} from '../helpers/test-database';
import {
  editableSeries,
  editableBox,
  saveSeries,
  saveBox,
  type SeriesEdit,
  type BoxEdit,
} from '@/features/administration/repository';
import { searchCollectionTitles } from '@/features/search/repository';
import { listSeries } from '@/features/collection/series.repository';
import { saveIntake } from '@/features/intake/save';
import { intakeInput } from '../helpers/intake-fixtures';
import { searchBoxes } from '@/features/boxes/search';
import { listBoxOptions } from '@/features/boxes/repository';
describe('series and box administration', () => {
  let db: TestDatabase;
  beforeEach(() => {
    db = createTestDatabase();
  });
  afterEach(() => db.close());
  const seriesInput = (changes: Partial<SeriesEdit> = {}): SeriesEdit => ({
    requestId: crypto.randomUUID(),
    id: 1,
    version: 0,
    name: 'Alpha Adventures',
    sortName: 'Alpha Adventures',
    year: 2024,
    status: 'ended',
    ...changes,
  });
  const boxInput = (changes: Partial<BoxEdit> = {}): BoxEdit => ({
    requestId: crypto.randomUUID(),
    id: null,
    version: 0,
    action: 'create',
    number: null,
    label: 'New box',
    type: 'short',
    ...changes,
  });
  it('edits series status and sort order without moving copies or changing prices', async () => {
    const holdings = await db.all('SELECT * FROM holdings ORDER BY id');
    const refs = await db.all('SELECT * FROM external_refs ORDER BY id');
    const history = await db.all('SELECT * FROM price_snapshots ORDER BY id');
    const request = seriesInput({ sortName: 'Adventures, Alpha' });
    await saveSeries(request, db);
    await saveSeries(request, db);
    expect(await editableSeries(1, db)).toMatchObject({
      status: 'ended',
      sortName: 'Adventures, Alpha',
      version: 1,
    });
    expect(await db.all('SELECT * FROM holdings ORDER BY id')).toEqual(
      holdings,
    );
    expect(await db.all('SELECT * FROM external_refs ORDER BY id')).toEqual(
      refs,
    );
    expect(await db.all('SELECT * FROM price_snapshots ORDER BY id')).toEqual(
      history,
    );
  });
  it('preserves old names and years in search and subsequent manual intake', async () => {
    await saveSeries(seriesInput({ name: 'Alpha Revised', year: 2025 }), db);
    expect(
      (await searchCollectionTitles('Alpha Adventures', db))[0],
    ).toMatchObject({ label: 'Alpha Revised', href: '/collection/1' });
    expect(
      (await listSeries({ query: 'Alpha Adventures', page: 1 }, db)).items[0]
        .id,
    ).toBe(1);
    const saved = await saveIntake(
      intakeInput({
        titleName: 'Alpha Adventures',
        titleYear: 2024,
        number: '77',
      }),
      undefined,
      { db },
    );
    expect(saved.seriesId).toBe(1);
    expect(
      await db.get('SELECT edit_version AS version FROM variants WHERE id=1'),
    ).toEqual({ version: 1 });
  });
  it('updates a trailing year and default sort name when the year is corrected', async () => {
    await db.run(
      "UPDATE series SET name='Alpha (2024)',sort_name='Alpha (2024)' WHERE id=1",
    );
    await saveSeries(
      seriesInput({
        name: 'Alpha (2024)',
        sortName: 'Alpha (2024)',
        year: 2025,
      }),
      db,
    );
    expect(await editableSeries(1, db)).toMatchObject({
      name: 'Alpha (2025)',
      sortName: 'Alpha (2025)',
      year: 2025,
    });
  });
  it('rejects conflicting identities, stale versions and reused requests', async () => {
    await expect(
      saveSeries(seriesInput({ name: 'Weird Tales', year: 1999 }), db),
    ).rejects.toThrow('already uses');
    const request = seriesInput();
    await saveSeries(request, db);
    await expect(
      saveSeries({ ...request, status: 'ongoing' }, db),
    ).rejects.toThrow('already used');
    await expect(saveSeries(seriesInput(), db)).rejects.toThrow('changed');
    await expect(saveSeries(seriesInput({ year: 1700 }), db)).rejects.toThrow(
      'valid series',
    );
  });
  it('creates boxes once, supports explicit numbers and exposes them to purchase forms', async () => {
    const request = boxInput();
    const id = await saveBox(request, db);
    expect(id).toBe(4);
    expect(await saveBox(request, db)).toBe(id);
    expect(await listBoxOptions(db)).toContainEqual({
      id: 4,
      label: 'New box',
      type: 'short',
    });
    expect(
      await saveBox(
        boxInput({ number: 20, label: null, type: 'magazine' }),
        db,
      ),
    ).toBe(20);
    await expect(saveBox(boxInput({ number: 1 }), db)).rejects.toThrow(
      'already used',
    );
  });
  it('edits labels and types while retaining the physical number and holdings', async () => {
    const holdings = await db.all('SELECT * FROM holdings ORDER BY id');
    await saveBox(
      boxInput({ action: 'edit', id: 1, label: 'Marvel A–F', type: 'long' }),
      db,
    );
    expect(await editableBox(1, db)).toMatchObject({
      id: 1,
      label: 'Marvel A–F',
      type: 'long',
      version: 1,
    });
    expect(await db.all('SELECT * FROM holdings ORDER BY id')).toEqual(
      holdings,
    );
    await expect(
      saveBox(boxInput({ action: 'edit', id: 1 }), db),
    ).rejects.toThrow('changed');
  });
  it('only removes confirmed empty boxes and never reuses retired numbers', async () => {
    await expect(
      saveBox(boxInput({ action: 'delete', id: 1, confirmed: true }), db),
    ).rejects.toThrow('Move all');
    const id = await saveBox(boxInput(), db);
    await expect(
      saveBox(boxInput({ action: 'delete', id, confirmed: false }), db),
    ).rejects.toThrow('Confirm');
    const request = boxInput({ action: 'delete', id, confirmed: true });
    await saveBox(request, db);
    await saveBox(request, db);
    expect(await editableBox(id, db)).toBeUndefined();
    expect(await saveBox(boxInput(), db)).toBe(5);
    await expect(saveBox(boxInput({ number: 4 }), db)).rejects.toThrow(
      'retired',
    );
  });
  it('keeps a box when a purchase arrives while its removal is being saved', async () => {
    const id = await saveBox(boxInput(), db);
    const original = db.batch.bind(db);
    db.batch = async (statements) => {
      await db.run(
        'INSERT INTO holdings(variant_id,quantity,box_id) VALUES(1,1,?)',
        [id],
      );
      return original(statements);
    };
    await expect(
      saveBox(boxInput({ action: 'delete', id, confirmed: true }), db),
    ).rejects.toThrow('gained collection entries');
    expect(await editableBox(id, db)).toMatchObject({ entries: 1, version: 0 });
  });
  it('rolls back a series edit if a late revision changes before the batch', async () => {
    const original = db.batch.bind(db);
    db.batch = async (statements) => {
      await db.run('UPDATE series SET edit_version=edit_version+1 WHERE id=1');
      return original(statements);
    };
    await expect(saveSeries(seriesInput({ name: 'Race' }), db)).rejects.toThrow(
      'changed',
    );
    expect((await editableSeries(1, db))?.name).toBe('Alpha Adventures');
    expect(await db.get('SELECT COUNT(*) AS n FROM series_aliases')).toEqual({
      n: 0,
    });
  });
  it('searches box numbers and labels literally and respects box type', async () => {
    expect((await searchBoxes('Box 3', 'all', db))[0]).toMatchObject({
      href: '/boxes/3',
    });
    expect(await searchBoxes('Long', 'short', db)).toEqual([]);
    expect(await searchBoxes('%', 'all', db)).toEqual([]);
  });
  it('preserves zero-quantity purchase records when retiring a physically empty box', async () => {
    const id = await saveBox(boxInput(), db);
    const holding = await db.run(
      'INSERT INTO holdings(variant_id,quantity,box_id,purchase_price_cents) VALUES(1,0,?,500)',
      [id],
    );
    await saveBox(boxInput({ action: 'delete', id, confirmed: true }), db);
    expect(
      await db.get(
        'SELECT quantity,box_id AS boxId,purchase_price_cents AS paid,edit_version AS version FROM holdings WHERE id=?',
        [Number(holding.lastInsertRowid)],
      ),
    ).toEqual({ quantity: 0, boxId: null, paid: 500, version: 1 });
  });
});

import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { MutationDatabase } from '@/db/database';
import { moveCopies } from '@/features/collection/box-move';
import {
  CopyEditConflict,
  getEditableCopy,
} from '@/features/collection/copy-edit';
import {
  getEditableMetadata,
  MetadataEditConflict,
  saveMetadata,
  type MetadataEditInput,
} from '@/features/collection/metadata-edit';
import {
  listVariantCredits,
  listVariantHoldings,
} from '@/features/collection/variant.repository';
import {
  listPriceHistory,
  getCurrentValuation,
} from '@/features/valuation/repository';
import { groupCopies } from '@/features/collection/copy-groups';
import { validateCover, type CoverStorage } from '@/covers/upload';
import {
  createTestDatabase,
  type TestDatabase,
} from '../helpers/test-database';

const png = () =>
  new File(
    [readFileSync(new URL('../fixtures/covers/tiny.png', import.meta.url))],
    'cover.png',
  );
const input = (
  overrides: Partial<MetadataEditInput> = {},
): MetadataEditInput => ({
  requestId: crypto.randomUUID(),
  variantId: 1,
  expectedVersion: 0,
  variantName: 'Corrected cover',
  storyTitle: 'New story',
  firstAppearanceOf: 'Another hero',
  details: 'Shared notes',
  publisherName: 'dc comics',
  coverPriceCents: 499,
  credits: [
    { name: 'jane writer', role: 'writer' },
    { name: 'New Artist', role: 'cover_artist' },
    { name: 'New Artist', role: 'cover_artist' },
  ],
  ...overrides,
});

describe('collection management writes', () => {
  let db: TestDatabase;
  beforeEach(() => {
    db = createTestDatabase();
  });
  afterEach(() => db.close());

  it('moves separate purchases together without changing quantity, purchase details or valuations', async () => {
    await db.run(
      "INSERT INTO holdings(id, variant_id, grade_tenths, quantity, box_id, current_value_cents, purchase_price_cents, purchase_date) VALUES (6,1,94,1,1,1200,900,'2026-10-12')",
    );
    const history = await listPriceHistory(1, db);
    const value = await getCurrentValuation(1, db);
    const move = {
      requestId: crypto.randomUUID(),
      copies: [
        { id: 1, version: 0 },
        { id: 6, version: 0 },
      ],
      boxId: 3,
    };
    await moveCopies(move, db);
    await moveCopies(move, db);
    expect(await getEditableCopy(1, db)).toMatchObject({
      quantity: 2,
      gradeTenths: 94,
      boxId: 3,
      valueCents: 1000,
      purchasePriceCents: 400,
      editVersion: 1,
      valuationEpoch: 0,
    });
    expect(await getEditableCopy(6, db)).toMatchObject({
      quantity: 1,
      boxId: 3,
      valueCents: 1200,
      purchasePriceCents: 900,
      purchaseDate: '2026-10-12',
    });
    expect(groupCopies(await listVariantHoldings(1, db))).toHaveLength(1);
    expect(await listPriceHistory(1, db)).toEqual(history);
    expect(await getCurrentValuation(1, db)).toEqual(value);
    await moveCopies(
      {
        requestId: crypto.randomUUID(),
        copies: [
          { id: 1, version: 1 },
          { id: 6, version: 1 },
        ],
        boxId: null,
      },
      db,
    );
    expect((await getEditableCopy(1, db))?.boxId).toBeNull();
    await expect(moveCopies({ ...move, boxId: null }, db)).rejects.toThrow(
      'already used',
    );
  });

  it('rejects bad destinations, duplicate copies, mismatched groups and stale moves', async () => {
    const move = {
      requestId: crypto.randomUUID(),
      copies: [{ id: 1, version: 0 }],
      boxId: 999,
    };
    await expect(moveCopies(move, db)).rejects.toThrow('no longer exists');
    await expect(
      moveCopies(
        {
          ...move,
          boxId: 3,
          copies: [
            { id: 1, version: 0 },
            { id: 1, version: 0 },
          ],
        },
        db,
      ),
    ).rejects.toThrow('valid copies');
    await expect(
      moveCopies(
        {
          ...move,
          boxId: 3,
          copies: [
            { id: 1, version: 0 },
            { id: 2, version: 0 },
          ],
        },
        db,
      ),
    ).rejects.toThrow('share a group');
    await expect(
      moveCopies({ ...move, boxId: 3, copies: [{ id: 1, version: 1 }] }, db),
    ).rejects.toBeInstanceOf(CopyEditConflict);
    expect((await getEditableCopy(1, db))?.boxId).toBe(1);
  });

  it('rolls back every box move if one copy changes between reading and writing', async () => {
    await db.run(
      'INSERT INTO holdings(id, variant_id, grade_tenths, quantity, box_id) VALUES (6,1,94,1,1)',
    );
    const racing: MutationDatabase = {
      all: db.all.bind(db),
      get: db.get.bind(db),
      run: db.run.bind(db),
      async batch(statements) {
        await db.run('UPDATE holdings SET edit_version = 1 WHERE id=6');
        return db.batch(statements);
      },
    };
    await expect(
      moveCopies(
        {
          requestId: crypto.randomUUID(),
          copies: [
            { id: 1, version: 0 },
            { id: 6, version: 0 },
          ],
          boxId: 3,
        },
        racing,
      ),
    ).rejects.toBeInstanceOf(CopyEditConflict);
    expect((await getEditableCopy(1, db))?.boxId).toBe(1);
    expect((await getEditableCopy(6, db))?.boxId).toBe(1);
    expect(await db.get('SELECT COUNT(*) AS n FROM copy_box_moves')).toEqual({
      n: 0,
    });
  });

  it('keeps a large group below D1 per-statement parameter limits', async () => {
    const copies = [{ id: 1, version: 0 }];
    for (let id = 10; id < 70; id++) {
      await db.run(
        'INSERT INTO holdings(id, variant_id, grade_tenths, quantity, box_id) VALUES (?,1,94,1,1)',
        [id],
      );
      copies.push({ id, version: 0 });
    }
    const checked: MutationDatabase = {
      all: db.all.bind(db),
      get: db.get.bind(db),
      run: db.run.bind(db),
      async batch(statements) {
        expect(
          statements.every(
            (statement) => (statement.parameters?.length ?? 0) <= 100,
          ),
        ).toBe(true);
        return db.batch(statements);
      },
    };
    await moveCopies(
      { requestId: crypto.randomUUID(), copies, boxId: 3 },
      checked,
    );
    expect(
      (
        await db.get<{ n: number }>(
          'SELECT COUNT(*) AS n FROM holdings WHERE variant_id=1 AND box_id=3',
        )
      )?.n,
    ).toBe(61);
  });

  it('edits shared metadata, reuses people/publishers and leaves ownership/history/provider references intact', async () => {
    const holdings = await listVariantHoldings(1, db);
    const history = await listPriceHistory(1, db);
    const refs = await db.all('SELECT * FROM external_refs');
    const edit = input();
    await saveMetadata(edit, undefined, db);
    await saveMetadata(edit, undefined, db);
    expect(await getEditableMetadata(1, db)).toMatchObject({
      variantName: 'Corrected cover',
      publisherName: 'DC Comics',
      imageKey: '1.jpg',
      editVersion: 1,
      coverPriceCents: 499,
    });
    expect(await listVariantCredits(1, db)).toEqual([
      { name: 'New Artist', role: 'cover_artist' },
      { name: 'Jane Writer', role: 'writer' },
    ]);
    expect(
      (await db.get<{ n: number }>('SELECT COUNT(*) AS n FROM publishers'))?.n,
    ).toBe(2);
    const after = await listVariantHoldings(1, db);
    expect(
      after.map((copy) => ({
        ...copy,
        variantName: 'Regular Cover',
        firstAppearanceOf: 'Test Hero',
      })),
    ).toEqual(holdings);
    expect(
      (await listPriceHistory(1, db)).map((snapshot) => ({
        ...snapshot,
        coverName: 'Regular Cover',
      })),
    ).toEqual(history);
    expect(await db.all('SELECT * FROM external_refs')).toEqual(refs);
    await expect(
      saveMetadata({ ...edit, details: 'Different' }, undefined, db),
    ).rejects.toThrow('already used');
    await expect(saveMetadata(input(), undefined, db)).rejects.toBeInstanceOf(
      MetadataEditConflict,
    );
  });

  it('creates a publisher and can clear optional details and creator credits', async () => {
    await saveMetadata(
      input({
        publisherName: 'New Publisher',
        storyTitle: null,
        firstAppearanceOf: null,
        details: null,
        coverPriceCents: 0,
        credits: [],
      }),
      undefined,
      db,
    );
    expect(await getEditableMetadata(1, db)).toMatchObject({
      publisherName: 'New Publisher',
      storyTitle: null,
      firstAppearanceOf: null,
      details: null,
      coverPriceCents: 0,
      credits: [],
    });
    await saveMetadata(
      input({ expectedVersion: 1, publisherName: null }),
      undefined,
      db,
    );
    expect((await getEditableMetadata(1, db))?.publisherName).toBeNull();
  });

  it('publishes a unique replacement image and replay does not upload again', async () => {
    const objects = new Map<string, string>();
    const storage: CoverStorage = {
      async put(key, cover) {
        objects.set(key, cover.contentType);
      },
      async remove(key) {
        objects.delete(key);
      },
    };
    const cover = await validateCover(png());
    const edit = input();
    await saveMetadata(edit, cover, db, storage);
    await saveMetadata(edit, cover, db, storage);
    const updated = await getEditableMetadata(1, db);
    expect(updated?.imageKey).toMatch(/^uploaded-.+\.png$/);
    expect(objects.size).toBe(1);
    expect(objects.get(updated!.imageKey!)).toBe('image/png');
    expect((await getEditableMetadata(2, db))?.imageKey).toBe('2.jpg');
  });

  it('keeps old metadata/image when storage fails and cleans up a raced replacement', async () => {
    const original = await getEditableMetadata(1, db);
    const cover = await validateCover(png());
    await expect(
      saveMetadata(input(), cover, db, {
        async put() {
          throw Error('offline');
        },
        async remove() {},
      }),
    ).rejects.toThrow('have not been changed');
    expect(await getEditableMetadata(1, db)).toEqual(original);
    const objects = new Set<string>();
    await expect(
      saveMetadata(input(), cover, db, {
        async put(key) {
          objects.add(key);
          await db.run('UPDATE variants SET edit_version=1 WHERE id=1');
        },
        async remove(key) {
          objects.delete(key);
        },
      }),
    ).rejects.toBeInstanceOf(MetadataEditConflict);
    expect(objects.size).toBe(0);
    expect((await getEditableMetadata(1, db))?.imageKey).toBe('1.jpg');
    expect((await getEditableMetadata(1, db))?.credits).toEqual(
      original?.credits,
    );
    expect(
      (
        await db.get<{ n: number }>(
          'SELECT COUNT(*) AS n FROM comic_metadata_edits',
        )
      )?.n,
    ).toBe(0);
  });
});

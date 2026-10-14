import { beforeEach, afterEach, describe, expect, it } from 'vitest';
import {
  createTestDatabase,
  type TestDatabase,
} from '../helpers/test-database';
import {
  changeCopyArchive,
  listSeriesRemovedCopies,
} from '@/features/collection/copy-archive';
import {
  CopyEditConflict,
  getEditableCopy,
} from '@/features/collection/copy-edit';
import { getBox } from '@/features/boxes/repository';
import {
  getSeries,
  listSeriesHoldings,
} from '@/features/collection/series.repository';
import {
  getDashboardSummary,
  getMostValuableHoldings,
} from '@/features/dashboard/repository';
import {
  listZapValuationTargets,
  getValuationHealthSummary,
  listPriceHistory,
  getCurrentValuation,
} from '@/features/valuation/repository';
import { liveValuationStatements } from '@/features/valuation/write';
let db: TestDatabase;
beforeEach(() => {
  db = createTestDatabase();
});
afterEach(() => db.close());
const input = (version = 0, action: 'archive' | 'restore' = 'archive') => ({
  requestId: crypto.randomUUID(),
  holdingId: 1,
  expectedVersion: version,
  action,
  confirmed: true,
});
describe('reversible copy removal', () => {
  it('keeps the last copy of an issue reachable from its series until restored', async () => {
    await db.run(
      'INSERT INTO holdings(id,variant_id,quantity,purchase_price_cents) VALUES(99,6,1,500)',
    );
    await changeCopyArchive({ ...input(), holdingId: 99 }, db);
    expect(await listSeriesHoldings(3, '', db)).toEqual([]);
    expect(await listSeriesRemovedCopies(3, db)).toEqual([
      expect.objectContaining({
        holdingId: 99,
        variantId: 6,
        type: 'annual',
        quantity: 1,
        purchasePriceCents: 500,
      }),
    ]);
    await changeCopyArchive({ ...input(1, 'restore'), holdingId: 99 }, db);
    expect(await listSeriesRemovedCopies(3, db)).toEqual([]);
  });
  it('removes owned quantity from every active view and restores the original purchase and history', async () => {
    const before = await getEditableCopy(1, db);
    const history = await listPriceHistory(1, db);
    const valuation = await getCurrentValuation(1, db);
    const remove = input();
    await changeCopyArchive(remove, db);
    await changeCopyArchive(remove, db);
    expect(await getEditableCopy(1, db)).toMatchObject({
      quantity: 0,
      editVersion: 1,
      purchasePriceCents: before!.purchasePriceCents,
      purchaseDate: before!.purchaseDate,
      valueCents: before!.valueCents,
    });
    expect((await getBox(1, db))?.copyCount).toBe(1);
    expect(
      (await getBox(1, db))?.holdings.map((h) => h.holdingId),
    ).not.toContain(1);
    expect((await getSeries(1, db))?.physicalCopies).toBe(2);
    expect(
      (await listSeriesHoldings(1, '', db)).map((h) => h.holdingId),
    ).not.toContain(1);
    expect((await getDashboardSummary(db)).physicalCopies).toBe(4);
    expect(
      (await getMostValuableHoldings(20, db)).map((h) => h.holdingId),
    ).not.toContain(1);
    expect(
      (await listZapValuationTargets(db)).map((h) => h.holdingId),
    ).not.toContain(1);
    expect((await getValuationHealthSummary(db)).totalHoldings).toBe(4);
    expect(await listPriceHistory(1, db)).toEqual(history);
    expect(await getCurrentValuation(1, db)).toEqual(valuation);
    const restore = input(1, 'restore');
    await changeCopyArchive(restore, db);
    await changeCopyArchive(restore, db);
    const { editVersion, ...restored } = (await getEditableCopy(1, db))!;
    expect(editVersion).toBe(2);
    const { editVersion: oldVersion, ...original } = before!;
    expect(oldVersion).toBe(0);
    expect(restored).toEqual(original);
    expect((await getDashboardSummary(db)).physicalCopies).toBe(6);
    expect(await listPriceHistory(1, db)).toEqual(history);
  });
  it('requires confirmation and rejects stale requests without changing quantities', async () => {
    await expect(
      changeCopyArchive({ ...input(), confirmed: false }, db),
    ).rejects.toThrow('Confirm');
    await expect(changeCopyArchive(input(1), db)).rejects.toBeInstanceOf(
      CopyEditConflict,
    );
    expect((await getEditableCopy(1, db))?.quantity).toBe(2);
  });
  it('prevents a late price refresh from changing removed copies', async () => {
    await changeCopyArchive(input(), db);
    const history = await listPriceHistory(1, db);
    const value = await getCurrentValuation(1, db);
    await db.batch(
      liveValuationStatements(
        {
          holdingId: 1,
          providerVariantId: '101',
          gradeTenths: 94,
          priceCents: 9999,
          sourcePriceCents: 9999,
          conditionPercentage: 100,
          observedAt: '2026-10-13',
          refreshedAt: '2026-10-13',
          syncRunId: null,
        },
        1,
        true,
      ),
    );
    expect((await getEditableCopy(1, db))?.valueCents).toBe(1000);
    expect(await getCurrentValuation(1, db)).toEqual(value);
    expect(await listPriceHistory(1, db)).toEqual(history);
  });
  it('rolls back removal when a concurrent edit changes the purchase group', async () => {
    const original = db.batch.bind(db);
    db.batch = async (statements) => {
      await db.run('UPDATE holdings SET quantity=3,edit_version=1 WHERE id=1');
      return original(statements);
    };
    await expect(changeCopyArchive(input(), db)).rejects.toBeInstanceOf(
      CopyEditConflict,
    );
    expect((await getEditableCopy(1, db))?.quantity).toBe(3);
    expect(await db.get('SELECT COUNT(*) AS total FROM copy_archives')).toEqual(
      { total: 0 },
    );
  });
});

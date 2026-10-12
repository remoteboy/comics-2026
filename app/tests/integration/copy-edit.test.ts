import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { MutationDatabase } from '@/db/database';
import {
  CopyEditConflict,
  getEditableCopy,
  saveCopyEdit,
  type CopyEditInput,
} from '@/features/collection/copy-edit';
import { getBiggestRecoveredMovers } from '@/features/dashboard/repository';
import { groupCopies } from '@/features/collection/copy-groups';
import { listVariantHoldings } from '@/features/collection/variant.repository';
import { getSaleCandidate } from '@/features/sales/repository';
import {
  createValuationSyncRun,
  getCurrentValuation,
  listPriceHistory,
  recordLiveValuation,
} from '@/features/valuation/repository';
import { refreshZapValuationBackfill } from '@/features/valuation/sync';
import {
  createTestDatabase,
  type TestDatabase,
} from '../helpers/test-database';
import { providerFixture } from '../helpers/provider-fixtures';
import type { ZapIssueConditionRow } from '@/providers/zap/live';

const unchangedZapClient = {
  async issueConditions() {
    return providerFixture(
      'zap-current-conditions.json',
    ) as ZapIssueConditionRow[];
  },
  async latestRawPrice(id: string) {
    return {
      id: 1,
      issue_id: Number(id),
      price: 10,
      price_guides: null,
      issues: null,
    };
  },
};

function edit(overrides: Partial<CopyEditInput> = {}): CopyEditInput {
  return {
    requestId: crypto.randomUUID(),
    holdingId: 1,
    expectedVersion: 0,
    scope: 'all',
    variantId: 1,
    gradeTenths: 94,
    quantity: 2,
    boxId: 1,
    purchaseDate: null,
    purchasePriceCents: 400,
    valueMode: 'keep',
    manualValueCents: null,
    ...overrides,
  };
}

describe('collection copy editing', () => {
  let db: TestDatabase;
  beforeEach(() => {
    db = createTestDatabase();
  });
  afterEach(() => db.close());

  it('edits purchase details without changing values or history, and keeps purchases grouped', async () => {
    const history = await listPriceHistory(1, db);
    const valuation = await getCurrentValuation(1, db);
    await saveCopyEdit(
      edit({ purchaseDate: '2024-02-29', purchasePriceCents: 350 }),
      db,
    );
    expect(await getEditableCopy(1, db)).toMatchObject({
      purchaseDate: '2024-02-29',
      purchasePriceCents: 350,
      valueCents: 1000,
      valuationEpoch: 0,
    });
    expect(await listPriceHistory(1, db)).toEqual(history);
    expect(await getCurrentValuation(1, db)).toEqual(valuation);
    const added = await saveCopyEdit(
      edit({
        expectedVersion: 1,
        scope: 'add',
        quantity: 1,
        purchaseDate: '2026-10-12',
        purchasePriceCents: 900,
        valueMode: 'manual',
        manualValueCents: 1000,
      }),
      db,
    );
    const groups = groupCopies(await listVariantHoldings(1, db));
    expect(groups).toHaveLength(1);
    expect(groups[0].quantity).toBe(3);
    expect(
      groups[0].copies.map((copy) => [
        copy.purchaseDate,
        copy.purchasePriceCents,
      ]),
    ).toEqual([
      ['2024-02-29', 350],
      ['2026-10-12', 900],
    ]);
    expect(await getEditableCopy(added, db)).toMatchObject({
      purchaseDate: '2026-10-12',
      purchasePriceCents: 900,
    });
  });

  it('preserves the original purchase when separating one copy and can clear an unknown date', async () => {
    await saveCopyEdit(edit({ purchaseDate: '2020-07-01' }), db);
    const id = await saveCopyEdit(
      edit({
        expectedVersion: 1,
        scope: 'one',
        quantity: 1,
        boxId: 3,
        purchaseDate: '2020-07-01',
      }),
      db,
    );
    for (const holdingId of [1, id])
      expect(await getEditableCopy(holdingId, db)).toMatchObject({
        purchaseDate: '2020-07-01',
        purchasePriceCents: 400,
      });
    await saveCopyEdit(
      edit({ holdingId: id, quantity: 1, boxId: 3, purchaseDate: null }),
      db,
    );
    expect((await getEditableCopy(id, db))?.purchaseDate).toBeNull();
    expect((await getEditableCopy(1, db))?.purchaseDate).toBe('2020-07-01');
  });

  it('rejects invalid purchase dates before writing any changes', async () => {
    const before = await getEditableCopy(1, db);
    await expect(
      saveCopyEdit(edit({ purchaseDate: '2025-02-29' }), db),
    ).rejects.toThrow('valid calendar date');
    expect(await getEditableCopy(1, db)).toEqual(before);
  });

  it('regroups a restored grade and another purchase without merging their histories', async () => {
    await saveCopyEdit(edit({ quantity: 5 }), db, unchangedZapClient);
    const originalHistory = await listPriceHistory(1, db);
    const changedId = await saveCopyEdit(
      edit({
        expectedVersion: 1,
        scope: 'one',
        quantity: 1,
        gradeTenths: 93,
        valueMode: 'unknown',
      }),
      db,
    );
    expect(groupCopies(await listVariantHoldings(1, db))).toHaveLength(2);
    await saveCopyEdit(
      edit({ holdingId: changedId, quantity: 1, valueMode: 'unknown' }),
      db,
    );
    const restored = groupCopies(await listVariantHoldings(1, db));
    expect(restored).toHaveLength(1);
    expect(restored[0]).toMatchObject({ quantity: 5, unknownQuantity: 1 });
    const purchasedId = await saveCopyEdit(
      edit({
        expectedVersion: 2,
        scope: 'add',
        quantity: 1,
        valueMode: 'unknown',
        purchasePriceCents: 900,
      }),
      db,
    );
    const groups = groupCopies(await listVariantHoldings(1, db));
    expect(groups).toHaveLength(1);
    expect(groups[0]).toMatchObject({
      quantity: 6,
      knownTotalCents: 4000,
      valuedQuantity: 4,
      unknownQuantity: 2,
    });
    expect(groups[0].copies).toHaveLength(3);
    expect(await listPriceHistory(1, db)).toEqual(originalHistory);
    expect(await listPriceHistory(changedId, db)).toHaveLength(0);
    expect(await listPriceHistory(purchasedId, db)).toHaveLength(0);
    expect(await getEditableCopy(purchasedId, db)).toMatchObject({
      purchasePriceCents: 900,
      valueCents: null,
    });
  });

  it('keeps the value when moving just one identical copy to another box', async () => {
    const id = await saveCopyEdit(
      edit({ scope: 'one', quantity: 1, boxId: 3 }),
      db,
    );
    expect(await getEditableCopy(id, db)).toMatchObject({
      quantity: 1,
      gradeTenths: 94,
      valueCents: 1000,
      boxId: 3,
    });
    expect(await getCurrentValuation(id, db)).toMatchObject({
      provider: 'legacy',
      priceCents: 1000,
    });
    expect((await listPriceHistory(id, db))[0]).toMatchObject({
      provider: 'copy',
      priceCents: 1000,
    });
    expect(await getEditableCopy(1, db)).toMatchObject({
      quantity: 1,
      valueCents: 1000,
      boxId: 1,
    });
  });

  it('changes storage without losing values, history or another copy row', async () => {
    await db.run(
      `INSERT INTO holdings(id, variant_id, grade_tenths, quantity, box_id, current_value_cents) VALUES (6, 1, 80, 1, 3, 700)`,
    );
    const history = await listPriceHistory(1, db);
    await saveCopyEdit(
      edit({ boxId: null, quantity: 3 }),
      db,
      unchangedZapClient,
    );
    expect(await getEditableCopy(1, db)).toMatchObject({
      quantity: 3,
      boxId: null,
      valueCents: 1000,
      valuationEpoch: 0,
      editVersion: 1,
    });
    expect(await getEditableCopy(6, db)).toMatchObject({
      quantity: 1,
      boxId: 3,
      gradeTenths: 80,
      valueCents: 700,
    });
    expect(await listPriceHistory(1, db)).toEqual(history);
    expect(await getCurrentValuation(1, db)).toMatchObject({
      priceCents: 1000,
    });
  });

  it('splits one of two copies while retaining the original history and watch', async () => {
    await db.run(
      `INSERT INTO sale_watch_state(holding_id, is_watched, notes) VALUES (1, 1, 'Keep original')`,
    );
    const id = await saveCopyEdit(
      edit({
        scope: 'one',
        quantity: 1,
        gradeTenths: 80,
        boxId: 3,
        valueMode: 'unknown',
      }),
      db,
    );
    expect(id).not.toBe(1);
    expect(await getEditableCopy(1, db)).toMatchObject({
      quantity: 1,
      gradeTenths: 94,
      valueCents: 1000,
      boxId: 1,
    });
    expect(await getEditableCopy(id, db)).toMatchObject({
      quantity: 1,
      gradeTenths: 80,
      valueCents: null,
      boxId: 3,
    });
    expect(await listPriceHistory(1, db)).toHaveLength(2);
    expect(await listPriceHistory(id, db)).toHaveLength(0);
    expect(await getSaleCandidate(1, db)).toMatchObject({
      watched: 1,
      notes: 'Keep original',
    });
    expect(await getSaleCandidate(id, db)).toMatchObject({ watched: 0 });
    expect(await getCurrentValuation(id, db)).toMatchObject({
      provider: 'pending',
      gradeTenths: 80,
      priceCents: null,
    });
  });

  it('adds another copy once even if an identical request is replayed', async () => {
    const input = edit({ scope: 'add', quantity: 1, valueMode: 'unknown' });
    const id = await saveCopyEdit(input, db);
    expect(await saveCopyEdit(input, db)).toBe(id);
    expect(
      await db.get<{ total: number }>(
        'SELECT SUM(quantity) AS total FROM holdings WHERE variant_id = 1',
      ),
    ).toEqual({ total: 3 });
    expect(
      await db.get<{ count: number }>(
        'SELECT COUNT(*) AS count FROM collection_edits',
      ),
    ).toEqual({ count: 1 });
    await expect(
      saveCopyEdit({ ...input, gradeTenths: 80 }, db),
    ).rejects.toThrow('already been used');
  });

  it('reassigns the selected copy to another stored cover without changing shared metadata', async () => {
    await saveCopyEdit(
      edit({
        holdingId: 4,
        variantId: 5,
        quantity: 1,
        purchasePriceCents: 300,
        valueMode: 'unknown',
      }),
      db,
    );
    expect(await getEditableCopy(4, db)).toMatchObject({
      variantId: 5,
      valueCents: null,
      valuationEpoch: 1,
    });
    expect(await getEditableCopy(5, db)).toMatchObject({
      variantId: 5,
      valueCents: 3000,
    });
    expect(await db.get('SELECT image_key FROM variants WHERE id = 4')).toEqual(
      { image_key: '4.jpg' },
    );
    expect((await listPriceHistory(4, db))[0]).toMatchObject({
      variantId: 4,
      valuationEpoch: 0,
    });
    await expect(saveCopyEdit(edit({ variantId: 5 }), db)).rejects.toThrow(
      'for this issue',
    );
  });

  it('records manual zero independently and does not count corrections as market gains', async () => {
    await saveCopyEdit(edit({ valueMode: 'manual', manualValueCents: 0 }), db);
    expect(await getEditableCopy(1, db)).toMatchObject({
      valueCents: 0,
      valuationEpoch: 1,
    });
    expect(await getCurrentValuation(1, db)).toMatchObject({
      provider: 'manual',
      priceCents: 0,
    });
    expect((await listPriceHistory(1, db))[0]).toMatchObject({
      provider: 'manual',
      priceCents: 0,
      valuationEpoch: 1,
    });
    expect(
      (await getBiggestRecoveredMovers(20, db)).some(
        (row) => row.holdingId === 1,
      ),
    ).toBe(false);
    expect(await getSaleCandidate(1, db)).toMatchObject({
      qualifies: false,
      price30DaysCents: null,
    });
  });

  it('rolls back a split if another write wins between loading and batching', async () => {
    const racing: MutationDatabase = {
      all: db.all.bind(db),
      get: db.get.bind(db),
      run: db.run.bind(db),
      async batch(statements) {
        await db.run(
          'UPDATE holdings SET edit_version = edit_version + 1 WHERE id = 1',
        );
        return db.batch(statements);
      },
    };
    await expect(
      saveCopyEdit(edit({ scope: 'one', quantity: 1 }), racing),
    ).rejects.toBeInstanceOf(CopyEditConflict);
    expect(await db.get('SELECT COUNT(*) AS count FROM holdings')).toEqual({
      count: 5,
    });
    expect(
      await db.get('SELECT COUNT(*) AS count FROM collection_edits'),
    ).toEqual({ count: 0 });
    expect(await getEditableCopy(1, db)).toMatchObject({
      quantity: 2,
      valueCents: 1000,
    });
  });

  it('rejects invalid grades, quantities, boxes and stale forms without writes', async () => {
    for (const overrides of [
      { gradeTenths: 101 },
      { quantity: 0 },
      { quantity: 1.5 },
      { boxId: 2 },
      { manualValueCents: -1 },
      { scope: 'one' as const, quantity: 2 },
    ]) {
      await expect(saveCopyEdit(edit(overrides), db)).rejects.toThrow();
    }
    await saveCopyEdit(edit({ boxId: 3 }), db);
    await expect(saveCopyEdit(edit(), db)).rejects.toBeInstanceOf(
      CopyEditConflict,
    );
    expect(
      await db.get('SELECT COUNT(*) AS count FROM collection_edits'),
    ).toEqual({ count: 1 });
  });

  it('discards a provider result captured before a same-grade manual correction', async () => {
    const runId = await createValuationSyncRun(new Date().toISOString(), db);
    await saveCopyEdit(
      edit({ valueMode: 'manual', manualValueCents: 2200 }),
      db,
    );
    const result = await recordLiveValuation(
      {
        holdingId: 1,
        expectedEditVersion: 0,
        providerVariantId: '101',
        gradeTenths: 94,
        priceCents: 1500,
        sourcePriceCents: 1500,
        conditionPercentage: 1,
        observedAt: new Date().toISOString(),
        refreshedAt: new Date().toISOString(),
        syncRunId: runId,
      },
      db,
    );
    expect(result).toBe('skipped');
    expect(await getCurrentValuation(1, db)).toMatchObject({
      provider: 'manual',
      priceCents: 2200,
    });
    expect(await listPriceHistory(1, db)).toHaveLength(3);
  });

  it('queues a changed grade even when the cover already has a successful provider check', async () => {
    await db.run(
      `INSERT INTO provider_price_checks(provider, provider_variant_id, status, checked_at) VALUES ('zap', '101', 'priced', datetime('now'))`,
    );
    await saveCopyEdit(edit({ gradeTenths: 80, valueMode: 'unknown' }), db);
    const result = await refreshZapValuationBackfill({
      db,
      batchSize: 1,
      requestDelayMs: 0,
      client: {
        async issueConditions() {
          return providerFixture(
            'zap-current-conditions.json',
          ) as ZapIssueConditionRow[];
        },
        async latestRawPrice() {
          return {
            id: 1,
            issue_id: 101,
            price: 10,
            price_guides: null,
            issues: null,
          };
        },
        async recentPriceChanges() {
          return [];
        },
      },
    });
    expect(result.stats.refreshedHoldings).toBe(1);
    expect(await getCurrentValuation(1, db)).toMatchObject({
      provider: 'zap',
      gradeTenths: 80,
      priceCents: 700,
    });
    expect((await listPriceHistory(1, db))[0]).toMatchObject({
      gradeTenths: 80,
      priceCents: 700,
      valuationEpoch: 1,
    });
  });
});

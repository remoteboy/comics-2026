import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  CopyEditConflict,
  getEditableCopy,
  saveCopyEdit,
  type CopyEditInput,
} from '@/features/collection/copy-edit';
import {
  CopyValuationUnavailable,
  type CopyValuationClient,
} from '@/features/collection/copy-valuation';
import {
  getCurrentValuation,
  listPriceHistory,
} from '@/features/valuation/repository';
import { getSaleCandidate } from '@/features/sales/repository';
import { providerFixture } from '../helpers/provider-fixtures';
import {
  createTestDatabase,
  type TestDatabase,
} from '../helpers/test-database';
import type { ZapIssueConditionRow } from '@/providers/zap/live';

function input(overrides: Partial<CopyEditInput> = {}): CopyEditInput {
  return {
    requestId: crypto.randomUUID(),
    holdingId: 1,
    expectedVersion: 0,
    scope: 'add',
    variantId: 1,
    gradeTenths: 94,
    quantity: 1,
    boxId: 1,
    purchaseDate: null,
    purchasePriceCents: 900,
    valueMode: 'zap',
    manualValueCents: null,
    ...overrides,
  };
}

function client(price = 15): CopyValuationClient & { calls: number } {
  return {
    calls: 0,
    async issueConditions() {
      return providerFixture(
        'zap-current-conditions.json',
      ) as ZapIssueConditionRow[];
    },
    async latestRawPrice(id) {
      this.calls += 1;
      return {
        id: 9001,
        issue_id: Number(id),
        price,
        price_guides: { effective_date: '2026-10-01T00:00:00Z' },
        issues: null,
      };
    },
  };
}

describe('Zap pricing during collection save', () => {
  let db: TestDatabase;
  beforeEach(() => {
    db = createTestDatabase();
  });
  afterEach(() => db.close());

  it('prices the purchase and updates same-cover/grade copies across boxes with one quote', async () => {
    await db.run(
      `INSERT INTO holdings(id, variant_id, grade_tenths, quantity, box_id, current_value_cents, purchase_price_cents) VALUES (6, 1, 94, 1, 3, 1200, 500), (7, 1, 80, 1, 1, 700, 300)`,
    );
    await db.run(
      `INSERT INTO sale_watch_state(holding_id, is_watched, notes) VALUES (6, 1, 'Watch this copy')`,
    );
    await db.run(
      "UPDATE holdings SET purchase_date = '2020-07-01' WHERE id IN (1, 6)",
    );
    const zap = client();
    const request = input({ purchaseDate: '2026-10-12' });
    const id = await saveCopyEdit(request, db, zap);
    expect(zap.calls).toBe(1);
    expect((await getEditableCopy(1, db))?.purchaseDate).toBe('2020-07-01');
    expect((await getEditableCopy(6, db))?.purchaseDate).toBe('2020-07-01');
    expect((await getEditableCopy(id, db))?.purchaseDate).toBe('2026-10-12');
    for (const owned of [1, 6, id]) {
      expect(await getEditableCopy(owned, db)).toMatchObject({
        gradeTenths: 94,
        valueCents: 1500,
      });
      expect(await getCurrentValuation(owned, db)).toMatchObject({
        provider: 'zap',
        providerVariantId: '101',
        priceCents: 1500,
      });
    }
    expect(await getEditableCopy(7, db)).toMatchObject({
      gradeTenths: 80,
      valueCents: 700,
    });
    expect(await getEditableCopy(5, db)).toMatchObject({
      variantId: 5,
      gradeTenths: 94,
      valueCents: 3000,
    });
    expect(await getEditableCopy(6, db)).toMatchObject({
      boxId: 3,
      purchasePriceCents: 500,
    });
    expect(await getEditableCopy(id, db)).toMatchObject({
      purchasePriceCents: 900,
    });
    expect(await getSaleCandidate(6, db)).toMatchObject({
      watched: 1,
      notes: 'Watch this copy',
    });
    expect(await listPriceHistory(1, db)).toHaveLength(3);
    expect(await listPriceHistory(6, db)).toHaveLength(1);
    expect(await listPriceHistory(id, db)).toHaveLength(1);
    expect(await saveCopyEdit(request, db, zap)).toBe(id);
    expect(zap.calls).toBe(1);
  });

  it('uses the selected grade for a correction and only updates peers at that grade', async () => {
    await db.run(
      `INSERT INTO holdings(id, variant_id, grade_tenths, quantity, box_id, current_value_cents) VALUES (6, 1, 80, 1, 3, 500)`,
    );
    const id = await saveCopyEdit(
      input({ scope: 'one', valueMode: 'keep', gradeTenths: 80 }),
      db,
      client(20),
    );
    expect(await getEditableCopy(id, db)).toMatchObject({
      gradeTenths: 80,
      valueCents: 1400,
    });
    expect(await getEditableCopy(6, db)).toMatchObject({
      gradeTenths: 80,
      valueCents: 1400,
    });
    expect(await getEditableCopy(1, db)).toMatchObject({
      gradeTenths: 94,
      quantity: 1,
      valueCents: 1000,
    });
    expect((await listPriceHistory(id, db))[0]).toMatchObject({
      gradeTenths: 80,
      priceCents: 1400,
      valuationEpoch: 0,
    });
  });

  it('prices a restored grade and refreshes the matching original copies', async () => {
    const id = await saveCopyEdit(
      input({ scope: 'one', valueMode: 'unknown', gradeTenths: 92 }),
      db,
    );
    const saved = await saveCopyEdit(
      input({
        holdingId: id,
        scope: 'all',
        valueMode: 'keep',
        gradeTenths: 94,
      }),
      db,
      client(),
    );
    expect(saved).toBe(id);
    expect(await getEditableCopy(id, db)).toMatchObject({
      valueCents: 1500,
      valuationEpoch: 1,
    });
    expect(await getEditableCopy(1, db)).toMatchObject({ valueCents: 1500 });
    expect((await listPriceHistory(id, db))[0]).toMatchObject({
      provider: 'zap',
      valuationEpoch: 1,
    });
  });

  it('keeps unchanged sibling price histories intact while refreshing their provider metadata', async () => {
    const history = await listPriceHistory(1, db);
    await saveCopyEdit(input(), db, client(10));
    expect(await listPriceHistory(1, db)).toEqual(history);
    expect(await getCurrentValuation(1, db)).toMatchObject({
      provider: 'zap',
      priceCents: 1000,
    });
  });

  it('leaves the collection untouched when Zap fails, has no price or cannot price the grade', async () => {
    const offline = client();
    offline.latestRawPrice = async () => {
      throw new Error('Offline');
    };
    const absent = client();
    absent.latestRawPrice = async () => null;
    for (const [request, zap] of [
      [input(), offline],
      [input(), absent],
      [input({ gradeTenths: 93 }), client()],
    ] as const) {
      await expect(saveCopyEdit(request, db, zap)).rejects.toBeInstanceOf(
        CopyValuationUnavailable,
      );
      expect(await db.get('SELECT COUNT(*) AS n FROM holdings')).toEqual({
        n: 5,
      });
      expect(
        await db.get('SELECT COUNT(*) AS n FROM collection_edits'),
      ).toEqual({ n: 0 });
      expect(await getEditableCopy(1, db)).toMatchObject({
        valueCents: 1000,
        editVersion: 0,
      });
    }
  });

  it('does not treat missing/ambiguous mappings as a zero price', async () => {
    await expect(
      saveCopyEdit(input({ holdingId: 2, variantId: 2 }), db, client()),
    ).rejects.toThrow('no Zap match');
    await db.run(
      `INSERT INTO external_refs(entity_type, entity_id, provider, external_id) VALUES ('variant', 1, 'zap', '999')`,
    );
    await expect(saveCopyEdit(input(), db, client())).rejects.toThrow(
      'conflicting Zap matches',
    );
    expect(await db.get('SELECT COUNT(*) AS n FROM collection_edits')).toEqual({
      n: 0,
    });
  });

  it('accepts a real provider zero and rejects a quote for the wrong cover', async () => {
    const id = await saveCopyEdit(input(), db, client(0));
    expect(await getCurrentValuation(id, db)).toMatchObject({
      provider: 'zap',
      priceCents: 0,
    });
    const wrong = client();
    wrong.latestRawPrice = async () => ({
      id: 1,
      issue_id: 999,
      price: 100,
      price_guides: null,
      issues: null,
    });
    await expect(
      saveCopyEdit(input({ expectedVersion: 1 }), db, wrong),
    ).rejects.toThrow('unusable price');
  });

  it('rejects missing or invalid raw prices rather than coercing them to zero', async () => {
    for (const value of [null, NaN, -1]) {
      const zap = client();
      zap.latestRawPrice = async () => ({
        id: 1,
        issue_id: 101,
        price: value as unknown as number,
        price_guides: null,
        issues: null,
      });
      await expect(saveCopyEdit(input(), db, zap)).rejects.toThrow(
        'unusable price',
      );
    }
    expect(await db.get('SELECT COUNT(*) AS n FROM holdings')).toEqual({
      n: 5,
    });
  });

  it('preserves a newer peer edit made while the quote was in flight', async () => {
    await db.run(
      `INSERT INTO holdings(id, variant_id, grade_tenths, quantity, box_id, current_value_cents) VALUES (6, 1, 94, 1, 3, 1200)`,
    );
    const zap = client();
    const fetchPrice = zap.latestRawPrice.bind(zap);
    zap.latestRawPrice = async (id) => {
      await saveCopyEdit(
        input({
          holdingId: 6,
          scope: 'all',
          valueMode: 'manual',
          manualValueCents: 3000,
          boxId: 3,
        }),
        db,
      );
      return fetchPrice(id);
    };
    const added = await saveCopyEdit(input(), db, zap);
    expect(await getEditableCopy(added, db)).toMatchObject({
      valueCents: 1500,
    });
    expect(await getCurrentValuation(6, db)).toMatchObject({
      provider: 'manual',
      priceCents: 3000,
    });
    expect(await listPriceHistory(6, db)).toHaveLength(1);
  });

  it('aborts the purchase if its source copy changed during the quote', async () => {
    const zap = client();
    const fetchPrice = zap.latestRawPrice.bind(zap);
    zap.latestRawPrice = async (id) => {
      await saveCopyEdit(
        input({
          scope: 'all',
          quantity: 2,
          valueMode: 'manual',
          manualValueCents: 3000,
        }),
        db,
      );
      return fetchPrice(id);
    };
    await expect(saveCopyEdit(input(), db, zap)).rejects.toBeInstanceOf(
      CopyEditConflict,
    );
    expect(await db.get('SELECT COUNT(*) AS n FROM holdings')).toEqual({
      n: 5,
    });
    expect(await getEditableCopy(1, db)).toMatchObject({
      valueCents: 3000,
      quantity: 2,
    });
  });
});

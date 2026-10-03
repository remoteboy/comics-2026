import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  getBiggestRecoveredMovers,
  getDashboardSummary,
  getMostValuableHoldings,
  getRecentValuationChanges,
} from '@/features/dashboard/repository';
import {
  createTestDatabase,
  type TestDatabase,
} from '../helpers/test-database';

let db: TestDatabase;

beforeEach(() => {
  db = createTestDatabase();
});

afterEach(() => {
  db.close();
});

describe('dashboard repository', () => {
  it('summarizes quantity, value and legacy data-health edge cases', async () => {
    const summary = await getDashboardSummary(db);

    expect(summary).toMatchObject({
      collectionValueCents: 7500,
      physicalCopies: 6,
      seriesCount: 3,
      boxCount: 2,
      boxedCopies: 5,
      unboxedCopies: 1,
      valuedHoldings: 4,
      unvaluedHoldings: 1,
      zeroValueHoldings: 1,
      staleValuedHoldings: 4,
      priceSnapshotCount: 4,
      latestValuationAt: '2022-06-01 10:00:00',
    });
  });

  it('ranks holdings by quantity-adjusted value', async () => {
    const holdings = await getMostValuableHoldings(3, db);

    expect(holdings.map((holding) => holding.holdingId)).toEqual([5, 4, 1]);
  });

  it('recovers the largest historical price movements', async () => {
    const movers = await getBiggestRecoveredMovers(2, db);

    expect(movers[0]).toMatchObject({
      holdingId: 4,
      previousPriceCents: 1000,
      snapshotPriceCents: 2500,
      deltaCents: 1500,
      changePercent: 150,
    });
    expect(movers[1]).toMatchObject({
      holdingId: 1,
      deltaCents: 500,
      changePercent: 100,
    });
  });

  it('orders recovered valuation events newest first', async () => {
    const changes = await getRecentValuationChanges(2, db);

    expect(changes.map((change) => change.holdingId)).toEqual([4, 1]);
  });
});

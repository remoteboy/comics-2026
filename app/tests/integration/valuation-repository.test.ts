import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  createValuationSyncRun,
  getCurrentValuation,
  getValuationHealthSummary,
  listPriceHistory,
  recordLiveValuation,
} from '@/features/valuation/repository';
import {
  createTestDatabase,
  type TestDatabase,
} from '../helpers/test-database';

describe('valuation repository', () => {
  let db: TestDatabase;

  beforeEach(() => {
    db = createTestDatabase();
  });

  afterEach(() => db.close());

  it('seeds explicit legacy current valuations from migrated holdings', async () => {
    const valuation = await getCurrentValuation(1, db);
    expect(valuation).toMatchObject({
      holdingId: 1,
      provider: 'legacy',
      providerVariantId: '101',
      gradeTenths: 94,
      priceCents: 1000,
    });
  });

  it('promotes a holding to live Zap and snapshots only a changed price', async () => {
    const runId = await createValuationSyncRun('2026-10-04T12:00:00.000Z', db);

    const first = await recordLiveValuation(
      {
        holdingId: 1,
        providerVariantId: '101',
        gradeTenths: 94,
        priceCents: 1500,
        sourcePriceCents: 1500,
        conditionPercentage: 1,
        observedAt: '2026-10-04T11:00:00+00:00',
        refreshedAt: '2026-10-04T12:00:00.000Z',
        syncRunId: runId,
      },
      db,
    );
    const second = await recordLiveValuation(
      {
        holdingId: 1,
        providerVariantId: '101',
        gradeTenths: 94,
        priceCents: 1500,
        sourcePriceCents: 1500,
        conditionPercentage: 1,
        observedAt: '2026-10-04T11:30:00+00:00',
        refreshedAt: '2026-10-04T12:30:00.000Z',
        syncRunId: runId,
      },
      db,
    );

    expect(first).toBe('changed');
    expect(second).toBe('unchanged');
    expect(await getCurrentValuation(1, db)).toMatchObject({
      provider: 'zap',
      priceCents: 1500,
      refreshedAt: '2026-10-04T12:30:00.000Z',
    });

    const history = await listPriceHistory(1, db);
    expect(history.filter((item) => item.provider === 'zap')).toHaveLength(3);
    expect(history[0]?.priceCents).toBe(1500);
  });

  it('reports live, legacy and missing valuation coverage separately', async () => {
    const runId = await createValuationSyncRun('2026-10-04T12:00:00.000Z', db);
    await recordLiveValuation(
      {
        holdingId: 1,
        providerVariantId: '101',
        gradeTenths: 94,
        priceCents: 1000,
        sourcePriceCents: 1000,
        conditionPercentage: 1,
        observedAt: '2026-10-04T11:00:00+00:00',
        refreshedAt: new Date().toISOString(),
        syncRunId: runId,
      },
      db,
    );

    const summary = await getValuationHealthSummary(db);
    expect(summary.totalHoldings).toBe(5);
    expect(summary.liveHoldings).toBe(1);
    expect(summary.freshHoldings).toBe(1);
    expect(summary.legacyHoldings).toBe(4);
    expect(summary.missingHoldings).toBe(1);
  });
});

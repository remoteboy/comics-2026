import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  getSaleCandidate,
  getSaleIntelligenceSettings,
  getSoldCompCache,
  listSaleCandidates,
  saveSoldCompCache,
  setSaleWatchState,
  updateSaleIntelligenceSettings,
} from '@/features/sales/repository';
import {
  createTestDatabase,
  type TestDatabase,
} from '../helpers/test-database';

describe('sale intelligence repository', () => {
  let db: TestDatabase;

  beforeEach(() => {
    db = createTestDatabase();
  });

  afterEach(() => db.close());

  it('stores configurable sale thresholds', async () => {
    expect(await getSaleIntelligenceSettings(db)).toEqual({
      minimumCurrentValueCents: 2000,
      minimumAbsoluteMovementCents: 1000,
      minimumPercentageMovement: 25,
    });

    await updateSaleIntelligenceSettings(
      {
        minimumCurrentValueCents: 5000,
        minimumAbsoluteMovementCents: 2500,
        minimumPercentageMovement: 40,
      },
      db,
    );

    expect(await getSaleIntelligenceSettings(db)).toEqual({
      minimumCurrentValueCents: 5000,
      minimumAbsoluteMovementCents: 2500,
      minimumPercentageMovement: 40,
    });
  });

  it('keeps a manual watch visible even when the holding is still legacy priced', async () => {
    await setSaleWatchState(1, true, 'Potential key issue.', db);

    const candidates = await listSaleCandidates(db);
    expect(candidates).toHaveLength(1);
    expect(candidates[0]).toMatchObject({
      holdingId: 1,
      watched: 1,
      qualifies: false,
      notes: 'Potential key issue.',
    });
  });

  it('flags a live holding with a large historical increase', async () => {
    await db.run(`UPDATE holdings SET current_value_cents = 3000 WHERE id = 1`);
    await db.run(
      `
        UPDATE current_valuations
        SET provider = 'zap', price_cents = 3000, refreshed_at = datetime('now')
        WHERE holding_id = 1
      `,
    );

    const candidate = await getSaleCandidate(1, db);
    expect(candidate).toMatchObject({
      holdingId: 1,
      qualifies: true,
      currentPriceCents: 3000,
    });
    expect(candidate?.bestAbsoluteMovementCents).toBe(2000);
  });

  it('caches sold-comps evidence by provider variant ID', async () => {
    await saveSoldCompCache(
      '101',
      '2026-10-07T12:00:00.000Z',
      JSON.stringify({ success: true, sale_count: 3 }),
      db,
    );

    expect(await getSoldCompCache('101', db)).toEqual({
      providerVariantId: '101',
      fetchedAt: '2026-10-07T12:00:00.000Z',
      responseJson: JSON.stringify({ success: true, sale_count: 3 }),
    });
  });
});

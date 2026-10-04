import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  getCurrentValuation,
  listPriceHistory,
  listValuationSyncRuns,
} from '@/features/valuation/repository';
import {
  refreshZapValuationBackfill,
  syncRecentZapValuations,
  type ZapValuationClient,
} from '@/features/valuation/sync';
import type {
  ZapIssueConditionRow,
  ZapRecentPriceChangeRow,
} from '@/providers/zap/live';
import { providerFixture } from '../helpers/provider-fixtures';
import {
  createTestDatabase,
  type TestDatabase,
} from '../helpers/test-database';

const conditions = providerFixture(
  'zap-current-conditions.json',
) as ZapIssueConditionRow[];

function update(
  overrides: Partial<ZapRecentPriceChangeRow>,
): ZapRecentPriceChangeRow {
  return {
    issue_id: 101,
    issue_number: '1',
    issue_variant: 'Regular Cover',
    title_id: 10,
    issue_type_id: 1,
    title_name: 'Alpha Adventures',
    cover_url: null,
    current_nm_price: 15,
    previous_nm_price: 10,
    price_change_date: '2026-10-03T12:00:00+00:00',
    issue_updated_at: '2026-10-03T12:00:00+00:00',
    issue_slug: '1-101',
    title_slug: 'alpha-adventures',
    total_count: 1,
    ...overrides,
  };
}

describe('valuation sync', () => {
  let db: TestDatabase;

  beforeEach(() => {
    db = createTestDatabase();
  });

  afterEach(() => db.close());

  it('matches recent Zap changes to owned variants and stores live values', async () => {
    const client: ZapValuationClient = {
      async issueConditions() {
        return conditions;
      },
      async latestRawPrice() {
        return null;
      },
      async recentPriceChanges() {
        return [update({})];
      },
    };

    const result = await syncRecentZapValuations({
      db,
      client,
      now: new Date('2026-10-04T12:00:00.000Z'),
    });

    expect(result.status).toBe('success');
    expect(result.stats.ownedRows).toBe(1);
    expect(result.stats.changedHoldings).toBe(1);
    expect(await getCurrentValuation(1, db)).toMatchObject({
      provider: 'zap',
      gradeTenths: 94,
      priceCents: 1500,
      sourcePriceCents: 1500,
      conditionPercentage: 1,
    });
    expect((await listPriceHistory(1, db))[0]?.priceCents).toBe(1500);
    expect((await listValuationSyncRuns(1, db))[0]?.status).toBe('success');
  });

  it('applies actual holding grade multipliers rather than NM to every copy', async () => {
    await db.run(
      "INSERT INTO external_refs(entity_type, entity_id, provider, external_id) VALUES ('variant', 3, 'zap', '303')",
    );

    const client: ZapValuationClient = {
      async issueConditions() {
        return conditions;
      },
      async latestRawPrice() {
        return null;
      },
      async recentPriceChanges() {
        return [update({ issue_id: 303, current_nm_price: 10 })];
      },
    };

    await syncRecentZapValuations({
      db,
      client,
      now: new Date('2026-10-04T12:00:00.000Z'),
    });

    expect(await getCurrentValuation(3, db)).toMatchObject({
      gradeTenths: 80,
      priceCents: 700,
      sourcePriceCents: 1000,
      conditionPercentage: 0.7,
    });
  });

  it('backfills a bounded stale batch through the observed latest-price endpoint', async () => {
    const client: ZapValuationClient = {
      async issueConditions() {
        return conditions;
      },
      async latestRawPrice(issueId) {
        if (String(issueId) !== '101') return null;
        return {
          id: 9001,
          issue_id: 101,
          price: 20,
          price_guides: { effective_date: '2026-10-01T00:00:00+00:00' },
          issues: { title_id: 10 },
        };
      },
      async recentPriceChanges() {
        return [];
      },
    };

    const result = await refreshZapValuationBackfill({
      db,
      client,
      now: new Date('2026-10-04T12:00:00.000Z'),
      batchSize: 1,
      concurrency: 1,
    });

    expect(result.stats.mode).toBe('backfill');
    expect(result.stats.providerRequests).toBe(1);
    expect(result.stats.refreshedHoldings).toBe(1);
    expect(await getCurrentValuation(1, db)).toMatchObject({
      provider: 'zap',
      priceCents: 2000,
      sourcePriceCents: 2000,
    });
  });
});

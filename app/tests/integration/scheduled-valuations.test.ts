import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import {
  runScheduledValuations,
  scheduledValuationState,
} from '@/features/valuation/scheduled';
import {
  getCurrentValuation,
  listPriceHistory,
} from '@/features/valuation/repository';
import {
  createTestDatabase,
  type TestDatabase,
} from '../helpers/test-database';
import { intakeClient } from '../helpers/intake-fixtures';
const now = new Date('2026-10-16T10:00:00.000Z');
let db: TestDatabase;
beforeEach(() => {
  db = createTestDatabase();
});
afterEach(() => db.close());
const run = (client = intakeClient(), time = now.getTime()) =>
  runScheduledValuations({ db, client, now: () => now, scheduledTime: time });
describe('scheduled valuations', () => {
  it('bounds each batch and advances across the collection instead of retrying the same failures first', async () => {
    for (const [variant, id] of [
      [2, '102'],
      [3, '103'],
      [4, '104'],
    ] as const)
      await db.run(
        "INSERT INTO external_refs(entity_type,entity_id,provider,external_id) VALUES('variant',?,'zap',?)",
        [variant, id],
      );
    const client = intakeClient({
      async latestRawPrice(id) {
        if (id === '101') throw new Error('Offline for this cover');
        return {
          id: 1,
          issue_id: Number(id),
          price: 15,
          price_guides: null,
          issues: null,
        };
      },
    });
    const request = vi.spyOn(client, 'latestRawPrice');
    await run(client);
    expect(request).toHaveBeenCalledTimes(2);
    await run(client, now.getTime() + 120000);
    expect(request).toHaveBeenCalledTimes(4);
    await run(client, now.getTime() + 240000);
    expect(request.mock.calls.map((call) => call[0])).toEqual([
      '101',
      '102',
      '103',
      '104',
      '205',
    ]);
  });
  it('also processes the recent change feed on the 22:30 UTC nightly tick', async () => {
    const tick = new Date('2026-10-16T22:30:00.000Z');
    const recentPriceChanges = vi.fn(async () => []);
    const result = await runScheduledValuations({
      db,
      client: { ...intakeClient(), recentPriceChanges },
      scheduledTime: tick.getTime(),
      now: () => tick,
    });
    expect(result.status).toBe('success');
    expect(recentPriceChanges).toHaveBeenCalledWith(15, 0);
    const rows = await db.all<{ stats: string }>(
      'SELECT stats_json AS stats FROM sync_runs ORDER BY id',
    );
    expect(rows.map((row) => JSON.parse(row.stats).mode)).toEqual([
      'scheduled',
      'recent',
    ]);
  });
  it('refreshes old prices absent from the recent feed and fans out by grade once per cover', async () => {
    await db.run(
      'INSERT INTO holdings(id,variant_id,quantity,grade_tenths,current_value_cents) VALUES(99,1,1,80,500)',
    );
    const client = {
      ...intakeClient(),
      recentPriceChanges: vi.fn(async () => []),
    };
    const price = vi.spyOn(client, 'latestRawPrice');
    const feed = client.recentPriceChanges;
    const result = await run(client);
    expect(result.status).toBe('success');
    expect(await getCurrentValuation(1, db)).toMatchObject({
      gradeTenths: 94,
      priceCents: 1500,
    });
    expect(await getCurrentValuation(99, db)).toMatchObject({
      gradeTenths: 80,
      priceCents: 1050,
    });
    expect(price.mock.calls.filter((call) => call[0] === '101')).toHaveLength(
      1,
    );
    expect(feed).not.toHaveBeenCalled();
    const history = await listPriceHistory(1, db);
    await run(client, now.getTime() + 300000);
    expect(price).toHaveBeenCalledTimes(2);
    expect(await listPriceHistory(1, db)).toEqual(history);
  });
  it('skips duplicate deliveries and overlapping runs', async () => {
    const client = intakeClient();
    const request = vi.spyOn(client, 'latestRawPrice');
    await run(client);
    expect((await run(client)).status).toBe('skipped');
    await db.run(
      "UPDATE scheduled_valuation_state SET locked_until='2099-01-01' WHERE id=1",
    );
    expect((await run(client, now.getTime() + 300000)).status).toBe('skipped');
    expect(request).toHaveBeenCalledTimes(2);
  });
  it('keeps local corrections and removals ahead of an in-flight provider response', async () => {
    await run(
      intakeClient({
        async latestRawPrice(id) {
          if (id === '101')
            await db.run(
              'UPDATE holdings SET quantity=0,edit_version=edit_version+1 WHERE id=1',
            );
          return {
            id: 1,
            issue_id: Number(id),
            price: 99,
            price_guides: null,
            issues: null,
          };
        },
      }),
    );
    expect(
      await db.get(
        'SELECT current_value_cents AS value FROM holdings WHERE id=1',
      ),
    ).toEqual({ value: 1000 });
  });
  it('does not invent zero prices for missing or invalid provider data and applies retry backoff', async () => {
    const client = intakeClient({
      async latestRawPrice(id) {
        if (id === '101') return null;
        throw new Error('secret token');
      },
    });
    const request = vi.spyOn(client, 'latestRawPrice');
    expect((await run(client)).status).toBe('partial');
    expect(
      await db.get(
        'SELECT current_value_cents AS value FROM holdings WHERE id=1',
      ),
    ).toEqual({ value: 1000 });
    await run(client, now.getTime() + 300000);
    expect(request).toHaveBeenCalledTimes(2);
    expect(
      JSON.stringify(await db.all('SELECT * FROM provider_price_checks')),
    ).not.toContain('secret token');
  });
  it('records a session failure safely and recovers once credentials work', async () => {
    expect(
      (
        await run(
          intakeClient({
            async issueConditions() {
              throw new Error('secret refresh token');
            },
          }),
        )
      ).status,
    ).toBe('failed');
    expect((await scheduledValuationState(db))?.errorText).not.toContain(
      'secret',
    );
    expect((await run(intakeClient(), now.getTime() + 300000)).status).toBe(
      'success',
    );
  });
  it('does not apply a response after its lease has been taken by a newer run', async () => {
    const client = intakeClient({
      async latestRawPrice(id) {
        await db.run(
          "UPDATE scheduled_valuation_state SET lease_token='new-owner',status='running' WHERE id=1",
        );
        return {
          id: 1,
          issue_id: Number(id),
          price: 99,
          price_guides: null,
          issues: null,
        };
      },
    });
    expect((await run(client)).status).toBe('failed');
    expect(
      await db.get(
        'SELECT current_value_cents AS value FROM holdings WHERE id=1',
      ),
    ).toEqual({ value: 1000 });
    expect((await scheduledValuationState(db))?.status).toBe('running');
  });
});

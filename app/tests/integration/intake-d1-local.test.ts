import { readFileSync, readdirSync } from 'node:fs';
import { it, expect } from 'vitest';
import { createRequire } from 'node:module';
// Resolve through the declared, pinned Wrangler dependency.
const { Miniflare, convertV4MiniflareOptions } = createRequire(
  import.meta.resolve('wrangler'),
)('miniflare');
import { D1Database, type D1DatabaseLike } from '@/db/cloudflare/d1-database';
import { saveIntake } from '@/features/intake/save';
import {
  storeIntakeLookup,
  discoverZapCovers,
} from '@/features/intake/catalog';
import {
  intakeClient,
  intakeInput,
  intakeTitle,
} from '../helpers/intake-fixtures';

it('runs the real intake batches on local D1, including replay, reuse and quote fan-out', async () => {
  const mf = new Miniflare(
    convertV4MiniflareOptions({
      workers: [
        {
          name: 'intake-check',
          modules: true,
          script: 'export default {fetch(){return new Response("ok")}}',
          compatibilityDate: '2026-10-11',
          d1Databases: { DB: 'intake-check' },
        },
      ],
    }),
  );
  try {
    const binding = await mf.getD1Database('DB', 'intake-check');
    const dir = new URL('../../../d1/migrations/', import.meta.url);
    for (const file of readdirSync(dir)
      .filter((name) => name.endsWith('.sql'))
      .sort())
      for (const sql of readFileSync(new URL(file, dir), 'utf8')
        .replace(/--[^\n]*/g, '')
        .split(';')
        .map((sql) => sql.trim())
        .filter(Boolean))
        await binding.prepare(sql).run();
    for (const sql of readFileSync(
      new URL('../fixtures/test-data.sql', import.meta.url),
      'utf8',
    )
      .split(';')
      .map((sql) => sql.trim())
      .filter(Boolean))
      await binding.prepare(sql).run();
    const db = new D1Database(binding as unknown as D1DatabaseLike);
    const lookupId = await storeIntakeLookup(
      {
        title: intakeTitle,
        localSeriesId: null,
        issueNumber: '1',
        issueType: 'issue',
        covers: await discoverZapCovers(
          intakeTitle,
          '1',
          'issue',
          intakeClient(),
        ),
      },
      db,
    );
    const request = intakeInput({
      lookupId,
      coverId: '8000',
      manualMetadata: null,
      valueMode: 'zap',
    });
    const first = await saveIntake(request, undefined, {
      db,
      zap: intakeClient(),
    });
    expect(
      await saveIntake(request, undefined, { db, zap: intakeClient() }),
    ).toEqual(first);
    const second = await saveIntake(
      { ...request, requestId: crypto.randomUUID(), purchasePriceCents: 500 },
      undefined,
      {
        db,
        zap: intakeClient({
          async latestRawPrice(id) {
            return {
              id: 2,
              issue_id: Number(id),
              price: 20,
              price_guides: null,
              issues: null,
            };
          },
        }),
      },
    );
    expect(second.variantId).toBe(first.variantId);
    expect(second.seriesId).toBe(first.seriesId);
    expect(
      (
        await db.get<{ price: number }>(
          'SELECT current_value_cents AS price FROM holdings WHERE id=?',
          [first.holdingId],
        )
      )?.price,
    ).toBe(2000);
    expect(
      (await db.get<{ n: number }>('SELECT COUNT(*) AS n FROM intake_requests'))
        ?.n,
    ).toBe(2);
  } finally {
    await mf.dispose();
  }
}, 30000);

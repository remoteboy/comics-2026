import {
  saveSeries,
  saveBox,
  editableBox,
} from '@/features/administration/repository';
import {
  changeCatalog,
  catalogIdentitySql,
} from '@/features/catalog/repository';
import { readFileSync, readdirSync } from 'node:fs';
import { it, expect } from 'vitest';
import { createRequire } from 'node:module';
// Resolve through the declared, pinned Wrangler dependency.
const { Miniflare, convertV4MiniflareOptions } = createRequire(
  import.meta.resolve('wrangler'),
)('miniflare');
import { D1Database, type D1DatabaseLike } from '@/db/cloudflare/d1-database';
import { saveIntake } from '@/features/intake/save';
import { runScheduledValuations } from '@/features/valuation/scheduled';
import { changeCopyArchive } from '@/features/collection/copy-archive';
import { getEditableCopy } from '@/features/collection/copy-edit';
import {
  getEditableMetadata,
  saveMetadata,
} from '@/features/collection/metadata-edit';
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
      download: async () => {
        throw new Error('Offline fixture');
      },
    });
    expect(
      await saveIntake(request, undefined, { db, zap: intakeClient() }),
    ).toEqual(first);
    const second = await saveIntake(
      { ...request, requestId: crypto.randomUUID(), purchasePriceCents: 500 },
      undefined,
      {
        db,
        download: async () => {
          throw new Error('Offline fixture');
        },
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
    await changeCatalog(
      {
        requestId: crypto.randomUUID(),
        kind: 'publisher',
        id: 1,
        version: 0,
        action: 'rename',
        name: 'DC Canonical',
      },
      db,
    );
    expect(
      await db.get(catalogIdentitySql('publisher'), ['DC Comics']),
    ).toEqual({ id: 1 });
    await db.run("INSERT INTO creators(id,name) VALUES(99,'Jane Duplicate')");
    await db.run(
      "INSERT INTO variant_credits(variant_id,creator_id,role) VALUES(1,99,'writer')",
    );
    await changeCatalog(
      {
        requestId: crypto.randomUUID(),
        kind: 'creator',
        id: 99,
        version: 0,
        action: 'merge',
        targetId: 1,
        targetVersion: 0,
        confirmed: true,
      },
      db,
    );
    expect(
      await db.get(
        'SELECT COUNT(*) AS n FROM variant_credits WHERE variant_id=1 AND creator_id=1 AND role=?',
        ['writer'],
      ),
    ).toEqual({ n: 1 });
    expect(
      await db.get(
        'SELECT new_id AS id FROM catalog_redirects WHERE kind=? AND old_id=?',
        ['creator', 99],
      ),
    ).toEqual({ id: 1 });
    await saveSeries(
      {
        requestId: crypto.randomUUID(),
        id: 1,
        version: 0,
        name: 'Alpha D1',
        sortName: 'Alpha D1',
        year: 2024,
        status: 'ended',
      },
      db,
    );
    expect(await db.get('SELECT name FROM series WHERE id=1')).toEqual({
      name: 'Alpha D1',
    });
    expect(
      await db.get('SELECT name FROM series_aliases WHERE series_id=1'),
    ).toEqual({ name: 'Alpha Adventures' });
    const boxId = await saveBox(
      {
        requestId: crypto.randomUUID(),
        id: null,
        version: 0,
        action: 'create',
        label: 'D1 box',
        type: 'short',
      },
      db,
    );
    await saveBox(
      {
        requestId: crypto.randomUUID(),
        id: boxId,
        version: 0,
        action: 'edit',
        label: 'D1 renamed',
        type: 'long',
      },
      db,
    );
    expect(await editableBox(boxId, db)).toMatchObject({
      label: 'D1 renamed',
      type: 'long',
    });
    await saveBox(
      {
        requestId: crypto.randomUUID(),
        id: boxId,
        version: 1,
        action: 'delete',
        label: 'D1 renamed',
        type: 'long',
        confirmed: true,
      },
      db,
    );
    expect(await editableBox(boxId, db)).toBeUndefined();
    const purchase = (await getEditableCopy(1, db))!;
    const history = await db.all(
      'SELECT * FROM price_snapshots WHERE holding_id=1 ORDER BY id',
    );
    const remove = {
      requestId: crypto.randomUUID(),
      holdingId: 1,
      expectedVersion: purchase.editVersion,
      action: 'archive' as const,
      confirmed: true,
    };
    await changeCopyArchive(remove, db);
    await changeCopyArchive(remove, db);
    expect((await getEditableCopy(1, db))?.quantity).toBe(0);
    const restore = {
      ...remove,
      requestId: crypto.randomUUID(),
      expectedVersion: purchase.editVersion + 1,
      action: 'restore' as const,
    };
    await changeCopyArchive(restore, db);
    await changeCopyArchive(restore, db);
    expect((await getEditableCopy(1, db))?.quantity).toBe(purchase.quantity);
    expect(
      await db.all(
        'SELECT * FROM price_snapshots WHERE holding_id=1 ORDER BY id',
      ),
    ).toEqual(history);
    await saveSeries(
      {
        requestId: crypto.randomUUID(),
        id: 1,
        version: 1,
        name: 'Alpha D1',
        sortName: 'Alpha D1',
        year: 2024,
        status: 'ended',
        providerMappings: { zap: '880011', comicVine: null },
      },
      db,
    );
    expect(
      await db.get(
        "SELECT external_id AS id FROM external_refs WHERE entity_type='series' AND entity_id=1 AND provider='zap'",
      ),
    ).toEqual({ id: '880011' });
    expect(
      await db.get(
        "SELECT external_id AS id FROM external_refs WHERE entity_type='variant' AND entity_id=1 AND provider='zap'",
      ),
    ).toEqual({ id: '101' });
    const metadata = (await getEditableMetadata(1, db))!;
    await saveMetadata(
      {
        requestId: crypto.randomUUID(),
        variantId: 1,
        expectedVersion: metadata.editVersion,
        variantName: metadata.variantName,
        storyTitle: metadata.storyTitle,
        firstAppearanceOf: metadata.firstAppearanceOf,
        details: metadata.details,
        publisherName: metadata.publisherName,
        coverPriceCents: metadata.coverPriceCents,
        credits: metadata.credits,
        providerMappings: { zap: '880022', comicVine: '4000-9001-0' },
      },
      undefined,
      db,
    );
    expect((await getEditableCopy(1, db))?.valueCents).toBeNull();
    expect(
      await db.all(
        'SELECT * FROM price_snapshots WHERE holding_id=1 ORDER BY id',
      ),
    ).toEqual(history);
    const scheduled = await runScheduledValuations({
      db,
      client: intakeClient(),
      scheduledTime: Date.parse('2026-10-16T10:00:00.000Z'),
      now: () => new Date('2026-10-16T10:00:00.000Z'),
    });
    expect(scheduled.status).toBe('success');
    expect(
      (
        await runScheduledValuations({
          db,
          client: intakeClient(),
          scheduledTime: Date.parse('2026-10-16T10:00:00.000Z'),
          now: () => new Date('2026-10-16T10:00:00.000Z'),
        })
      ).status,
    ).toBe('skipped');
  } finally {
    await mf.dispose();
  }
}, 30000);

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('@/features/intake/images', () => ({
  downloadProviderCover: vi.fn(async () => {
    throw new Error('Offline fixture');
  }),
}));
import {
  createTestDatabase,
  type TestDatabase,
} from '../helpers/test-database';
import {
  discoverZapCovers,
  storeIntakeLookup,
} from '@/features/intake/catalog';
import { saveIntake } from '@/features/intake/save';
import { groupCopies } from '@/features/collection/copy-groups';
import { getEditableCopy } from '@/features/collection/copy-edit';
import { getEditableMetadata } from '@/features/collection/metadata-edit';
import { listVariantHoldings } from '@/features/collection/variant.repository';
import {
  getCurrentValuation,
  listPriceHistory,
} from '@/features/valuation/repository';
import {
  intakeClient,
  intakeInput,
  intakeTitle,
  intakeDetail,
  intakePhoto,
} from '../helpers/intake-fixtures';
import type { IntakeZapClient } from '@/features/intake/types';

describe('one-save collection intake', () => {
  let db: TestDatabase;
  beforeEach(() => {
    db = createTestDatabase();
  });
  afterEach(() => db.close());
  const lookup = async (
    client: IntakeZapClient = intakeClient(),
    type: 'issue' | 'annual' = 'issue',
    localSeriesId: number | null = null,
  ) =>
    storeIntakeLookup(
      {
        title: intakeTitle,
        localSeriesId,
        issueNumber: '1',
        issueType: type,
        covers: await discoverZapCovers(intakeTitle, '1', type, client),
      },
      db,
    );
  it('creates title, issue, cover, metadata and valued ownership in one save', async () => {
    const lookupId = await lookup();
    const request = intakeInput({
      lookupId,
      coverId: '8000',
      valueMode: 'zap',
      manualMetadata: null,
    });
    const saved = await saveIntake(request, undefined, {
      db,
      zap: intakeClient(),
      download: async (url) => {
        expect(url).toBe(
          'https://zkc-club-covers.s3.us-east-1.amazonaws.com/8000.jpg',
        );
        return intakePhoto();
      },
      storage: { put: vi.fn(async () => {}), remove: vi.fn(async () => {}) },
    });
    expect((await getEditableMetadata(saved.variantId, db))?.imageKey).toMatch(
      /^uploaded-/,
    );
    expect(await getEditableCopy(saved.holdingId, db)).toMatchObject({
      quantity: 1,
      gradeTenths: 94,
      purchasePriceCents: 900,
      purchaseDate: '2026-10-12',
      valueCents: 1500,
      boxId: 1,
    });
    expect(await getEditableMetadata(saved.variantId, db)).toMatchObject({
      seriesName: intakeTitle.name,
      variantName: 'Cover A',
      storyTitle: 'New story',
      publisherName: 'DC Comics',
      coverPriceCents: 399,
    });
    expect(await getCurrentValuation(saved.holdingId, db)).toMatchObject({
      provider: 'zap',
      providerVariantId: '8000',
      priceCents: 1500,
    });
    expect(await listPriceHistory(saved.holdingId, db)).toHaveLength(1);
    expect(
      (
        await db.get<{ n: number }>(
          "SELECT COUNT(*) AS n FROM creators WHERE name='Jane Writer'",
        )
      )?.n,
    ).toBe(1);
    expect(
      await db.get(
        "SELECT entity_id AS id FROM external_refs WHERE entity_type='series' AND external_id='9900'",
      ),
    ).toEqual({ id: saved.seriesId });
    expect(
      await saveIntake(request, undefined, {
        db,
        zap: intakeClient({
          async issueDetails() {
            throw Error('Must replay without lookup');
          },
        }),
      }),
    ).toEqual(saved);
    expect(
      (
        await db.get<{ n: number }>(
          'SELECT COUNT(*) AS n FROM holdings WHERE creation_request_id=?',
          [request.requestId],
        )
      )?.n,
    ).toBe(1);
  });
  it('uses verified cached metadata during an endpoint outage and still gets a fresh quote', async () => {
    const lookupId = await lookup();
    const saved = await saveIntake(
      intakeInput({
        lookupId,
        coverId: '8000',
        valueMode: 'zap',
        manualMetadata: null,
      }),
      undefined,
      {
        db,
        zap: intakeClient({
          async issueDetails() {
            throw Error('temporarily unavailable');
          },
        }),
      },
    );
    expect((await getEditableCopy(saved.holdingId, db))?.valueCents).toBe(1500);
    expect(saved.warnings).toContain(
      'Zap details were temporarily unavailable, so the saved cover details came from your earlier lookup.',
    );
    expect((await getEditableMetadata(saved.variantId, db))?.storyTitle).toBe(
      'New story',
    );
  });

  it('adds an imported exact cover to its existing title and refreshes its owned copies', async () => {
    await db.run(
      "UPDATE external_refs SET external_id='9900' WHERE entity_type='series' AND entity_id=1 AND provider='zap'",
    );
    const zap = intakeClient({
      async issuesForTitle() {
        return {
          issues: [
            {
              ...intakeDetail({ id: 101, issue_slug_out: '1-101' }),
              nm_price: 15,
              total_issue_count: 1,
            },
          ],
          total_count: 1,
        };
      },
      async issueDetails() {
        return intakeDetail({ id: 101, issue_slug_out: '1-101' });
      },
    });
    const id = await lookup(zap, 'issue', 1);
    const saved = await saveIntake(
      intakeInput({
        lookupId: id,
        coverId: '101',
        localSeriesId: 1,
        valueMode: 'zap',
        manualMetadata: null,
      }),
      undefined,
      { db, zap },
    );
    expect(saved.seriesId).toBe(1);
    expect(saved.variantId).toBe(1);
    expect((await getEditableCopy(1, db))?.valueCents).toBe(1500);
    expect((await getEditableMetadata(1, db))?.variantName).toBe(
      'Regular Cover',
    );
    expect(groupCopies(await listVariantHoldings(1, db))[0].quantity).toBe(3);
  });

  it('keeps a new purchase grouped with existing same-grade copies and refreshes all their values', async () => {
    const first = await saveIntake(
      intakeInput({
        lookupId: await lookup(),
        coverId: '8000',
        valueMode: 'zap',
        manualMetadata: null,
      }),
      undefined,
      { db, zap: intakeClient() },
    );
    const second = await saveIntake(
      intakeInput({
        lookupId: await lookup(),
        coverId: '8000',
        valueMode: 'zap',
        manualMetadata: null,
        purchasePriceCents: 500,
        purchaseDate: '2020-07-01',
      }),
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
    const groups = groupCopies(await listVariantHoldings(first.variantId, db));
    expect(groups).toHaveLength(1);
    expect(groups[0].quantity).toBe(2);
    expect((await getEditableCopy(first.holdingId, db))?.valueCents).toBe(2000);
    expect(
      (await getEditableCopy(first.holdingId, db))?.purchasePriceCents,
    ).toBe(900);
    expect(
      (await getEditableCopy(second.holdingId, db))?.purchasePriceCents,
    ).toBe(500);
    expect(
      (
        await db.get<{ n: number }>(
          'SELECT COUNT(*) AS n FROM variants WHERE creation_request_id IS NOT NULL',
        )
      )?.n,
    ).toBe(1);
  });
  it('does not overwrite corrected shared metadata or change peer grades while refreshing prices', async () => {
    const first = await saveIntake(
      intakeInput({
        lookupId: await lookup(),
        coverId: '8000',
        valueMode: 'zap',
        manualMetadata: null,
      }),
      undefined,
      { db, zap: intakeClient() },
    );
    await db.run(
      'UPDATE variants SET name=?,details=?,edit_version=edit_version+1 WHERE id=?',
      ['Owner correction', 'Owner notes', first.variantId],
    );
    await db.run(
      'INSERT INTO holdings(variant_id,grade_tenths,quantity,current_value_cents) VALUES (?,80,1,800)',
      [first.variantId],
    );
    await saveIntake(
      intakeInput({
        lookupId: await lookup(),
        coverId: '8000',
        valueMode: 'zap',
        manualMetadata: null,
      }),
      undefined,
      { db, zap: intakeClient() },
    );
    expect(await getEditableMetadata(first.variantId, db)).toMatchObject({
      variantName: 'Owner correction',
      details: 'Owner notes',
    });
    expect(
      (
        await db.get<{ price: number }>(
          'SELECT current_value_cents AS price FROM holdings WHERE variant_id=? AND grade_tenths=80',
          [first.variantId],
        )
      )?.price,
    ).toBe(800);
  });
  it('leaves the catalogue and collection unchanged if pricing or metadata verification fails', async () => {
    const lookupId = await lookup();
    const before = await db.get('SELECT COUNT(*) AS n FROM series');
    const request = intakeInput({
      lookupId,
      coverId: '8000',
      valueMode: 'zap',
      manualMetadata: null,
    });
    await expect(
      saveIntake(request, undefined, {
        db,
        zap: intakeClient({
          async latestRawPrice() {
            throw Error('offline');
          },
        }),
      }),
    ).rejects.toThrow('could not provide a value');
    await expect(
      saveIntake(request, undefined, {
        db,
        zap: intakeClient({
          async issueDetails() {
            return intakeDetail({ number: '2' });
          },
        }),
      }),
    ).rejects.toThrow('no longer matches');
    expect(await db.get('SELECT COUNT(*) AS n FROM series')).toEqual(before);
    expect(
      (await db.get<{ n: number }>('SELECT COUNT(*) AS n FROM intake_requests'))
        ?.n,
    ).toBe(0);
  });
  it('supports manual entry, known zero, image upload and separate annual identity', async () => {
    const objects = new Map<string, string>();
    const storage = {
      async put(key: string) {
        objects.set(key, 'image');
      },
      async remove(key: string) {
        objects.delete(key);
      },
    };
    const request = intakeInput({ manualValueCents: 0, quantity: 2 });
    const photo = await intakePhoto();
    const regular = await saveIntake(request, photo, { db, storage });
    expect(await getEditableCopy(regular.holdingId, db)).toMatchObject({
      quantity: 2,
      valueCents: 0,
      purchaseDate: '2026-10-12',
    });
    expect(
      (await getEditableMetadata(regular.variantId, db))?.imageKey,
    ).toMatch(/^uploaded-.+\.png$/);
    expect(objects.size).toBe(1);
    const annual = await saveIntake(
      intakeInput({
        issueType: 'annual',
        valueMode: 'unknown',
        manualValueCents: null,
      }),
      undefined,
      { db },
    );
    expect(annual.seriesId).toBe(regular.seriesId);
    expect(annual.variantId).not.toBe(regular.variantId);
    expect((await getEditableMetadata(annual.variantId, db))?.issueType).toBe(
      'annual',
    );
    expect(
      (await getEditableCopy(annual.holdingId, db))?.valueCents,
    ).toBeNull();
    expect((await getCurrentValuation(annual.holdingId, db))?.provider).toBe(
      'pending',
    );
  });
  it('reuses a manual title/cover without replacing existing metadata or losing purchase history', async () => {
    const first = await saveIntake(intakeInput(), undefined, { db });
    const second = await saveIntake(
      intakeInput({
        manualMetadata: {
          ...intakeInput().manualMetadata!,
          storyTitle: 'Different story',
        },
        purchasePriceCents: 300,
        purchaseDate: null,
      }),
      undefined,
      { db },
    );
    expect(first.variantId).toBe(second.variantId);
    expect(first.seriesId).toBe(second.seriesId);
    expect((await getEditableMetadata(first.variantId, db))?.storyTitle).toBe(
      'A manual story',
    );
    expect(await listPriceHistory(first.holdingId, db)).toHaveLength(1);
  });
  it('rejects invalid/expired selections and request-id reuse with altered input', async () => {
    const id = await lookup();
    const request = intakeInput({
      lookupId: id,
      coverId: '8000',
      valueMode: 'zap',
      manualMetadata: null,
    });
    await expect(
      saveIntake({ ...request, coverId: '9999' }, undefined, {
        db,
        zap: intakeClient(),
      }),
    ).rejects.toThrow('Choose a cover');
    await db.run(
      "UPDATE intake_lookups SET expires_at='2000-01-01' WHERE id=?",
      [id],
    );
    await expect(
      saveIntake(request, undefined, { db, zap: intakeClient() }),
    ).rejects.toThrow('expired');
    const manual = intakeInput();
    await saveIntake(manual, undefined, { db });
    await expect(
      saveIntake({ ...manual, quantity: 3 }, undefined, { db }),
    ).rejects.toThrow('already used');
  });
  it('rolls back a partially executed batch and cleans up its new photo', async () => {
    const before = await db.get('SELECT COUNT(*) AS n FROM series');
    await db.run(
      "CREATE TRIGGER fail_intake BEFORE INSERT ON holdings WHEN NEW.creation_request_id IS NOT NULL BEGIN SELECT RAISE(ABORT,'forced failure'); END",
    );
    const images = new Set<string>();
    await expect(
      saveIntake(intakeInput(), await intakePhoto(), {
        db,
        storage: {
          async put(key) {
            images.add(key);
          },
          async remove(key) {
            images.delete(key);
          },
        },
      }),
    ).rejects.toThrow('forced failure');
    expect(images.size).toBe(0);
    expect(await db.get('SELECT COUNT(*) AS n FROM series')).toEqual(before);
    expect(
      (await db.get<{ n: number }>('SELECT COUNT(*) AS n FROM intake_requests'))
        ?.n,
    ).toBe(0);
  });
  it('handles a repeated request that commits while its quote is being fetched', async () => {
    const id = await lookup();
    const request = intakeInput({
      lookupId: id,
      coverId: '8000',
      valueMode: 'zap',
      manualMetadata: null,
    });
    let first;
    const racing = intakeClient({
      async latestRawPrice(issueId) {
        first = await saveIntake(request, undefined, {
          db,
          zap: intakeClient(),
        });
        return {
          id: 1,
          issue_id: Number(issueId),
          price: 20,
          price_guides: null,
          issues: null,
        };
      },
    });
    expect(await saveIntake(request, undefined, { db, zap: racing })).toEqual(
      first,
    );
    expect(
      (await db.get<{ n: number }>('SELECT COUNT(*) AS n FROM intake_requests'))
        ?.n,
    ).toBe(1);
  });
  it('skips an existing copy corrected during a quote request', async () => {
    const first = await saveIntake(
      intakeInput({
        lookupId: await lookup(),
        coverId: '8000',
        valueMode: 'zap',
        manualMetadata: null,
      }),
      undefined,
      { db, zap: intakeClient() },
    );
    await saveIntake(
      intakeInput({
        lookupId: await lookup(),
        coverId: '8000',
        valueMode: 'zap',
        manualMetadata: null,
      }),
      undefined,
      {
        db,
        zap: intakeClient({
          async latestRawPrice(id) {
            await db.run(
              'UPDATE holdings SET grade_tenths=80,current_value_cents=1234,edit_version=edit_version+1 WHERE id=?',
              [first.holdingId],
            );
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
    expect(await getEditableCopy(first.holdingId, db)).toMatchObject({
      gradeTenths: 80,
      valueCents: 1234,
    });
  });
});

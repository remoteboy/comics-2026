import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  getVariant,
  listVariantCredits,
  listVariantExternalReferences,
  listVariantHoldings,
} from '@/features/collection/variant.repository';
import { listPriceHistory } from '@/features/valuation/repository';
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

describe('variant and valuation repositories', () => {
  it('loads exact variant metadata', async () => {
    const variant = await getVariant(1, db);

    expect(variant).toMatchObject({
      seriesName: 'Alpha Adventures',
      issueNumber: '1',
      variantName: 'Regular Cover',
      firstAppearanceOf: 'Test Hero',
      publisherName: 'DC Comics',
      coverPriceCents: 399,
    });
  });

  it('preserves a multi-copy holding', async () => {
    const holdings = await listVariantHoldings(1, db);

    expect(holdings).toHaveLength(1);
    expect(holdings[0]).toMatchObject({
      gradeTenths: 94,
      quantity: 2,
      boxId: 1,
      valueCents: 1000,
    });
  });

  it('loads creator credits and provider identities', async () => {
    const credits = await listVariantCredits(1, db);
    const refs = await listVariantExternalReferences(1, db);

    expect(credits).toEqual([
      { name: 'Alex Artist', role: 'artist' },
      { name: 'Jane Writer', role: 'writer' },
    ]);
    expect(refs).toEqual([
      { provider: 'comic_vine', externalId: '4000-9001-0' },
      { provider: 'zap', externalId: '101' },
    ]);
  });

  it('returns recovered price history newest first', async () => {
    const history = await listPriceHistory(1, db);

    expect(history.map((snapshot) => snapshot.priceCents)).toEqual([1000, 500]);
  });

  it('returns undefined for a missing variant', async () => {
    expect(await getVariant(999, db)).toBeUndefined();
  });
});

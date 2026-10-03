import { describe, expect, it } from 'vitest';

import { RecordedZapProvider } from '@/providers/zap/provider';
import { providerFixture } from '../../helpers/provider-fixtures';

const provider = new RecordedZapProvider();
const flatIssue = providerFixture('zap-flat-issue.json');
const richVariant = providerFixture('zap-rich-variant.json');
const updates = providerFixture('zap-updates.json');

describe('RecordedZapProvider', () => {
  it('normalizes series identity from a recorded legacy issue response', () => {
    expect(provider.normalizeSeries(flatIssue)).toEqual({
      provider: 'zap',
      externalId: '23051',
      name: '100-Page Crisis On Infinite Earths Giant (2020)',
      startYear: 2020,
      publisher: 'DC Comics',
    });
  });

  it('prefers the nested Zap title id over the local wrapper title id', () => {
    const series = provider.normalizeSeries(richVariant);

    expect(series).toMatchObject({
      externalId: '4094',
      name: 'Black Science (2013)',
      publisher: 'Image Comics',
    });
  });

  it('normalizes logical issue identity separately from the exact variant', () => {
    expect(provider.normalizeIssue(richVariant)).toMatchObject({
      externalId: '188440',
      seriesExternalId: '4094',
      number: '39',
      type: 'issue',
      coverDate: 'March 2019',
    });

    expect(provider.normalizeVariants(richVariant)).toEqual([
      expect.objectContaining({
        externalId: '288960',
        issueExternalId: '188440',
        label: 'Variant Cover',
        coverPriceCents: 399,
        imageUrl: 'https://comics.zapkapowcomics.com/image.php?id=288960',
      }),
    ]);
  });

  it('normalizes creator roles from the recorded issue payload', () => {
    const creators = provider.normalizeIssue(richVariant)?.creators ?? [];

    expect(creators).toEqual(
      expect.arrayContaining([
        { externalId: null, name: 'Rick Remender', roles: ['writer'] },
        {
          externalId: null,
          name: 'Matteo Scalera and Moreno DiNisio',
          roles: ['penciller'],
        },
        { externalId: null, name: 'Kevin Maguire', roles: ['cover_artist'] },
      ]),
    );
  });

  it('normalizes the full recorded grade-based price guide', () => {
    const valuations = provider.normalizeValuations(richVariant);

    expect(valuations).toHaveLength(24);
    expect(valuations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ gradeTenths: 94, priceCents: 400 }),
        expect.objectContaining({ gradeTenths: 98, priceCents: 500 }),
        expect.objectContaining({ gradeTenths: 80, priceCents: 280 }),
      ]),
    );
  });

  it('normalizes the older single-grade valuation shape', () => {
    expect(provider.normalizeValuations(flatIssue)).toEqual([
      {
        provider: 'zap',
        variantExternalId: '311140',
        gradeTenths: 94,
        priceCents: 1000,
        currency: 'USD',
        conditionLabel: 'Near Mint',
      },
    ]);
  });

  it('normalizes recorded update-feed events including new annuals', () => {
    const normalized = provider.normalizeUpdates(updates);

    expect(normalized).toHaveLength(4);
    expect(normalized[0]).toMatchObject({
      variantExternalId: '49926',
      seriesExternalId: '3564',
      currentPriceCents: 2000,
      previousPriceCents: 600,
      gradeTenths: 94,
      isNew: false,
    });
    expect(normalized[1]).toMatchObject({
      variantExternalId: '102864',
      currentPriceCents: 1500,
      previousPriceCents: 3000,
    });
    expect(normalized[3]).toMatchObject({
      variantExternalId: '323239',
      number: '2020',
      type: 'annual',
      isNew: true,
    });
  });
});

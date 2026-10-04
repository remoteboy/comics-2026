import { describe, expect, it } from 'vitest';

import {
  normalizeCurrentZapIssue,
  normalizeCurrentZapSeries,
  normalizeCurrentZapVariants,
} from '@/providers/zap/live/catalog';
import { normalizeCurrentZapUpdates } from '@/providers/zap/live/updates';
import {
  normalizeCurrentZapGradedValuations,
  normalizeCurrentZapRawValuations,
} from '@/providers/zap/live/valuation';

import { providerFixture } from '../../helpers/provider-fixtures';

describe('current Zap normalizers', () => {
  it('normalizes a current title-search row', () => {
    const search = providerFixture('zap-current-search.json') as unknown[];
    const series = normalizeCurrentZapSeries(search[0]);

    expect(series).toEqual({
      provider: 'zap',
      externalId: '26920',
      name: 'Miracleman: The Silver Age (2022)',
      startYear: 2022,
      publisher: null,
    });
  });

  it('preserves exact current Zap cover IDs as variants', () => {
    const variants = normalizeCurrentZapVariants(
      providerFixture('zap-current-issues.json'),
    );

    expect(variants).toHaveLength(2);
    expect(variants[1]).toMatchObject({
      externalId: '196362',
      issueExternalId: null,
      label: 'Variant Cover',
      coverPriceCents: 399,
      imageUrl: null,
    });
  });

  it('normalizes current issue detail and creator metadata', () => {
    const issue = normalizeCurrentZapIssue(
      providerFixture('zap-current-issue-detail.json'),
    );

    expect(issue).toMatchObject({
      externalId: '196357',
      seriesExternalId: '7889',
      number: '2',
      keyIssue: true,
      firstAppearanceOf: 'Spider-Gwen',
      images: null,
    });
    expect(issue?.creators.map((credit) => credit.name)).toEqual([
      'Jason Latour',
      'Robbi Rodriguez',
      'Robbi Rodriguez',
    ]);
  });

  it('also tolerates the generic PostgREST one-row array shape', () => {
    const detail = providerFixture('zap-current-issue-detail.json');

    expect(normalizeCurrentZapIssue([detail])).toMatchObject({
      externalId: '196357',
      number: '2',
    });
    expect(normalizeCurrentZapRawValuations([detail])).toEqual([
      expect.objectContaining({
        variantExternalId: '196357',
        gradeTenths: 94,
        priceCents: 30000,
      }),
    ]);
  });

  it('keeps raw NM and slabbed grade pricing separate', () => {
    const raw = normalizeCurrentZapRawValuations(
      providerFixture('zap-current-issue-detail.json'),
    );
    const graded = normalizeCurrentZapGradedValuations(
      providerFixture('zap-current-graded-prices.json'),
      '196357',
    );

    expect(raw).toEqual([
      expect.objectContaining({
        variantExternalId: '196357',
        gradeTenths: 94,
        priceCents: 30000,
        conditionLabel: 'Near Mint',
      }),
    ]);
    expect(graded).toContainEqual(
      expect.objectContaining({
        variantExternalId: '196357',
        gradeTenths: 94,
        priceCents: 35000,
      }),
    );
  });

  it('normalizes the current database-wide NM price-change feed', () => {
    const updates = normalizeCurrentZapUpdates(
      providerFixture('zap-current-updates.json'),
    );

    expect(updates).toEqual([
      expect.objectContaining({
        variantExternalId: '469930',
        seriesExternalId: '31419',
        gradeTenths: 94,
        currentPriceCents: 3500,
        previousPriceCents: 1500,
        updatedAt: '2026-10-04T08:46:34.188+00:00',
      }),
    ]);
  });
});

import { describe, expect, it } from 'vitest';

import {
  ebayResearchUrl,
  evaluateSaleCandidate,
} from '@/features/sales/calculate';

const settings = {
  minimumCurrentValueCents: 2000,
  minimumAbsoluteMovementCents: 1000,
  minimumPercentageMovement: 25,
};

describe('sale candidate calculation', () => {
  it('flags a meaningful positive movement by absolute or percentage threshold', () => {
    expect(
      evaluateSaleCandidate(
        {
          currentPriceCents: 4000,
          price30DaysCents: 2500,
          price90DaysCents: 3500,
        },
        settings,
      ),
    ).toMatchObject({
      qualifies: true,
      bestAbsoluteMovementCents: 1500,
      bestPercentageMovement: 60,
    });
  });

  it('does not flag a drop, a flat price or a comic below the minimum value', () => {
    expect(
      evaluateSaleCandidate(
        {
          currentPriceCents: 1500,
          price30DaysCents: 500,
          price90DaysCents: 500,
        },
        settings,
      ).qualifies,
    ).toBe(false);

    expect(
      evaluateSaleCandidate(
        {
          currentPriceCents: 3000,
          price30DaysCents: 3500,
          price90DaysCents: 3000,
        },
        settings,
      ).qualifies,
    ).toBe(false);
  });

  it('builds a completed/sold eBay research URL from comic identity', () => {
    const url = new URL(
      ebayResearchUrl('Alpha Adventures (2024)', '1/2', 'Foil Cover'),
    );
    expect(url.hostname).toBe('www.ebay.com');
    expect(url.searchParams.get('LH_Sold')).toBe('1');
    expect(url.searchParams.get('LH_Complete')).toBe('1');
    expect(url.searchParams.get('_nkw')).toContain('Alpha Adventures');
    expect(url.searchParams.get('_nkw')).toContain('#1/2');
  });
});

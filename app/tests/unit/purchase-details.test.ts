import { describe, expect, it } from 'vitest';
import {
  parsePurchaseDate,
  purchaseDetails,
  suggestedPurchaseDate,
} from '@/features/collection/purchase-details';
import { copyEditFromForm } from '@/features/collection/copy-form';

describe('actual purchase dates', () => {
  it('suggests the recorded purchase date before the date entered', () => {
    expect(
      suggestedPurchaseDate({
        purchaseDate: '2020-07-01',
        createdAt: '2026-10-12T12:00:00Z',
      }),
    ).toBe('2020-07-01');
    expect(
      suggestedPurchaseDate({
        purchaseDate: null,
        createdAt: '2026-10-12 12:00:00',
      }),
    ).toBe('2026-10-12');
    expect(
      suggestedPurchaseDate({ purchaseDate: null, createdAt: 'invalid' }),
    ).toBe('');
  });

  it('accepts blank and real dates including leap years', () => {
    expect(parsePurchaseDate('')).toBeNull();
    expect(parsePurchaseDate(null)).toBeNull();
    for (const date of ['2024-02-29', '2000-02-29', '2026-10-12'])
      expect(parsePurchaseDate(date)).toBe(date);
  });
  it('rejects malformed and impossible calendar dates', () => {
    for (const date of [
      '2025-02-29',
      '1900-02-29',
      '2026-04-31',
      '2026-00-01',
      '2026-13-01',
      '2026-01-00',
      '0000-01-01',
      '12/10/2026',
      '2026-1-1',
      '2026-10-12T00:00:00Z',
      undefined,
    ])
      expect(() => parsePurchaseDate(date)).toThrow();
  });
  it('shows unknown details explicitly and keeps known zero separate', () => {
    expect(
      purchaseDetails({ purchaseDate: null, purchasePriceCents: null }),
    ).toBe('Purchase date not recorded · price not recorded');
    expect(
      purchaseDetails({ purchaseDate: '2026-10-12', purchasePriceCents: 0 }),
    ).toBe('Purchased 12 Oct 2026 · paid $0.00 per copy');
  });
  it('parses the form purchase date without timezone conversion', () => {
    const data = new FormData();
    for (const [name, value] of Object.entries({
      requestId: crypto.randomUUID(),
      expectedVersion: '0',
      scope: 'all',
      variantId: '1',
      grade: '9.4',
      quantity: '1',
      boxId: '',
      purchasePrice: '9.00',
      purchaseDate: '2024-02-29',
      valueMode: 'keep',
    }))
      data.set(name, value);
    expect(copyEditFromForm(data, 1)).toMatchObject({
      purchaseDate: '2024-02-29',
      purchasePriceCents: 900,
    });
    data.set('purchaseDate', '2025-02-29');
    expect(() => copyEditFromForm(data, 1)).toThrow('valid calendar date');
    data.set('purchaseDate', '');
    expect(copyEditFromForm(data, 1).purchaseDate).toBeNull();
  });
});

import { describe, expect, it } from 'vitest';
import {
  copyEditFromForm,
  isSameOriginForm,
} from '@/features/collection/copy-form';

function form(overrides: Record<string, string | undefined> = {}) {
  const data = new FormData();
  for (const [key, value] of Object.entries({
    requestId: crypto.randomUUID(),
    expectedVersion: '0',
    scope: 'all',
    variantId: '1',
    grade: '9.4',
    quantity: '1',
    boxId: '',
    purchasePrice: '3.99',
    purchaseDate: '',
    valueMode: 'manual',
    manualValue: '0',
    ...overrides,
  }))
    if (value !== undefined) data.set(key, value);
  return data;
}

describe('copy edit form boundary', () => {
  it('keeps unknown grade/box distinct from known zero and parses cents exactly', () => {
    expect(copyEditFromForm(form({ grade: '' }), 1)).toMatchObject({
      gradeTenths: null,
      boxId: null,
      manualValueCents: 0,
      purchasePriceCents: 399,
    });
  });
  it('rejects malformed numeric values instead of coercing them', () => {
    for (const values of [
      { quantity: '1.5' },
      { quantity: '1e2' },
      { grade: '9.44' },
      { purchasePrice: '-1' },
      { manualValue: 'NaN' },
      { purchasePrice: '3.999' },
    ])
      expect(() => copyEditFromForm(form(values), 1)).toThrow();
  });
  it('accepts same-origin urlencoded forms and rejects cross-origin/missing-origin requests', () => {
    const url = new URL('https://comics.example/copies/1/edit');
    const request = (origin?: string) =>
      new Request(url, {
        method: 'POST',
        headers: {
          'content-type': 'application/x-www-form-urlencoded',
          ...(origin ? { origin } : {}),
        },
      });
    expect(isSameOriginForm(request(url.origin), url)).toBe(true);
    expect(isSameOriginForm(request('https://other.example'), url)).toBe(false);
    expect(isSameOriginForm(request(), url)).toBe(false);
  });
});

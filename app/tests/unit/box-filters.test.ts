import { describe, expect, it } from 'vitest';

import { boxFilters } from '@/features/boxes/filters';

describe('boxFilters', () => {
  it('trims search text and accepts known box types', () => {
    expect(boxFilters(new URLSearchParams('q=%20Short%20&type=short'))).toEqual(
      {
        query: 'Short',
        type: 'short',
      },
    );
  });

  it('falls back to all for an unknown type', () => {
    expect(boxFilters(new URLSearchParams('type=crate'))).toEqual({
      query: '',
      type: 'all',
    });
  });
});

import { describe, expect, it } from 'vitest';

import {
  collectionFilters,
  collectionUrl,
} from '@/features/collection/filters';

function params(value: string): URLSearchParams {
  return new URLSearchParams(value);
}

describe('collectionFilters', () => {
  it('trims search text and accepts known filter values', () => {
    expect(
      collectionFilters(
        params('q=%20Batman%20&status=ongoing&health=unboxed&sort=value'),
      ),
    ).toEqual({
      query: 'Batman',
      status: 'ongoing',
      health: 'unboxed',
      sort: 'value',
    });
  });

  it('falls back safely for unknown values', () => {
    expect(
      collectionFilters(params('status=paused&health=broken&sort=publisher')),
    ).toEqual({
      query: '',
      status: 'all',
      health: 'all',
      sort: 'title',
    });
  });
});

describe('collectionUrl', () => {
  it('omits default filters and the first page', () => {
    expect(
      collectionUrl({
        query: '',
        status: 'all',
        health: 'all',
        sort: 'title',
      }),
    ).toBe('/collection');
  });

  it('preserves active filters while paging', () => {
    expect(
      collectionUrl(
        {
          query: 'Spider-Man',
          status: 'ended',
          health: 'missing-value',
          sort: 'copies',
        },
        3,
      ),
    ).toBe(
      '/collection?q=Spider-Man&status=ended&health=missing-value&sort=copies&page=3',
    );
  });
});

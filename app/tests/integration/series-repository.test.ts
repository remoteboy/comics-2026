import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  getSeries,
  listSeries,
  listSeriesHoldings,
} from '@/features/collection/series.repository';
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

describe('series repository', () => {
  it('lists series with aggregate collection values', async () => {
    const result = await listSeries({ query: '', page: 1 }, db);

    expect(result.total).toBe(3);
    expect(result.items.map((item) => item.name)).toEqual([
      'Alpha Adventures',
      'Empty Series',
      'Weird Tales',
    ]);
    expect(result.items[0]).toMatchObject({
      issueCount: 3,
      variantCount: 3,
      copyCount: 4,
      valueCents: 2000,
      publishers: ['DC Comics'],
    });
  });

  it('searches series by publisher and creator', async () => {
    const publisher = await listSeries({ query: 'DC Comics', page: 1 }, db);
    const creator = await listSeries({ query: 'Jane Writer', page: 1 }, db);

    expect(publisher.items.map((item) => item.name)).toEqual([
      'Alpha Adventures',
    ]);
    expect(creator.items.map((item) => item.name)).toEqual([
      'Alpha Adventures',
    ]);
  });

  it.each([
    ['missing-value', 'Alpha Adventures'],
    ['zero-value', 'Alpha Adventures'],
    ['unboxed', 'Alpha Adventures'],
  ] as const)('supports the %s health filter', async (health, expected) => {
    const result = await listSeries({ query: '', page: 1, health }, db);
    expect(result.items.map((item) => item.name)).toEqual([expected]);
  });

  it('finds series with stale stored valuations', async () => {
    const result = await listSeries(
      { query: '', page: 1, health: 'stale-value' },
      db,
    );

    expect(result.items.map((item) => item.name)).toEqual([
      'Alpha Adventures',
      'Weird Tales',
    ]);
  });

  it('sorts by aggregate value when requested', async () => {
    const result = await listSeries({ query: '', page: 1, sort: 'value' }, db);

    expect(result.items.map((item) => item.name)).toEqual([
      'Weird Tales',
      'Alpha Adventures',
      'Empty Series',
    ]);
  });

  it('returns a series summary including unboxed and unvalued holdings', async () => {
    const series = await getSeries(1, db);

    expect(series).toMatchObject({
      name: 'Alpha Adventures',
      issueCount: 3,
      ownedVariants: 3,
      physicalCopies: 4,
      boxCount: 2,
      valueCents: 2000,
      unboxedCopies: 1,
      unvaluedHoldings: 1,
    });
  });

  it('does not count unowned catalogue variants as missing valuations', async () => {
    const series = await getSeries(3, db);

    expect(series).toMatchObject({
      name: 'Empty Series',
      ownedVariants: 0,
      physicalCopies: 0,
      unvaluedHoldings: 0,
    });
  });

  it('keeps unusual issue numbers intact and in useful order', async () => {
    const holdings = await listSeriesHoldings(1, '', db);

    expect(holdings.map((holding) => holding.issueNumber)).toEqual([
      '1',
      '1/2',
      '12.1',
    ]);
  });

  it('keeps multiple variants of one logical issue separate', async () => {
    const holdings = await listSeriesHoldings(2, '', db);

    expect(holdings).toHaveLength(2);
    expect(holdings.map((holding) => holding.issueNumber)).toEqual(['5', '5']);
    expect(holdings.map((holding) => holding.variantName)).toEqual([
      'Cover A',
      'Cover B',
    ]);
  });

  it('filters a series by creator and significance metadata', async () => {
    const creator = await listSeriesHoldings(1, 'Jane Writer', db);
    const significance = await listSeriesHoldings(1, 'Test Hero', db);

    expect(creator.map((holding) => holding.variantId)).toEqual([1]);
    expect(significance.map((holding) => holding.variantId)).toEqual([1]);
  });
});

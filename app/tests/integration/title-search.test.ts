import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  createTestDatabase,
  type TestDatabase,
} from '../helpers/test-database';
import { searchCollectionTitles } from '@/features/search/repository';
describe('collection title suggestions', () => {
  let db: TestDatabase;
  beforeEach(() => {
    db = createTestDatabase();
  });
  afterEach(() => db.close());
  it('finds titles without requiring owned copies and returns series links', async () => {
    expect(await searchCollectionTitles('alpha', db)).toEqual([
      { label: 'Alpha Adventures', detail: '2024', href: '/collection/1' },
    ]);
    expect(await searchCollectionTitles('Empty', db)).toHaveLength(1);
    expect(await searchCollectionTitles('DC Comics', db)).toEqual([]);
  });
  it('treats wildcard characters as literal text and bounds short queries', async () => {
    expect(await searchCollectionTitles('%_', db)).toEqual([]);
    expect(await searchCollectionTitles('a', db)).toEqual([]);
    expect(await searchCollectionTitles("' OR 1=1 --", db)).toEqual([]);
  });
});

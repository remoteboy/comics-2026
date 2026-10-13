import { beforeEach, afterEach, describe, expect, it } from 'vitest';
import {
  createTestDatabase,
  type TestDatabase,
} from '../helpers/test-database';
import {
  browseSeries,
  browseIssues,
  browseFilters,
  type BrowseFilters,
} from '@/features/catalog/browse';
const filters: BrowseFilters = {
  title: '',
  role: '',
  owned: false,
  seriesId: null,
};
describe('catalogue series browsing', () => {
  let db: TestDatabase;
  beforeEach(() => {
    db = createTestDatabase();
  });
  afterEach(() => db.close());
  it('shows each publisher series once with publisher-specific counts', async () => {
    const result = await browseSeries('publisher', 1, filters, 1, db);
    expect(result.total).toBe(1);
    expect(result.items[0]).toMatchObject({
      id: 1,
      name: 'Alpha Adventures',
      issueCount: 3,
      coverCount: 3,
      copyCount: 4,
    });
    expect((await browseSeries('publisher', 2, filters, 1, db)).total).toBe(2);
    expect(
      (
        await browseSeries('publisher', 2, { ...filters, owned: true }, 1, db)
      ).items.map((s) => s.name),
    ).toEqual(['Weird Tales']);
  });
  it('groups creator credits without duplicate counts and scopes role and title filters', async () => {
    await db.run(
      "INSERT INTO variant_credits(variant_id,creator_id,role) VALUES(1,1,'writer'),(1,1,'inker'),(2,1,'inker'),(6,1,'writer')",
    );
    const all = await browseSeries('creator', 1, filters, 1, db);
    expect(all.total).toBe(2);
    expect(all.items[0]).toMatchObject({
      coverCount: 2,
      issueCount: 2,
      copyCount: 3,
    });
    const writer = await browseSeries(
      'creator',
      1,
      { ...filters, title: 'Alpha', role: 'writer' },
      1,
      db,
    );
    expect(writer.items[0].coverCount).toBe(1);
    const inker = await browseIssues(
      'creator',
      1,
      { ...filters, role: 'inker' },
      1,
      1,
      db,
    );
    expect(inker.items.map((i) => i.number)).toEqual(['1/2', '1']);
    expect(
      (await browseSeries('creator', 1, { ...filters, owned: true }, 1, db))
        .total,
    ).toBe(1);
    expect(
      (await browseSeries('creator', 2, { ...filters, title: 'Empty' }, 1, db))
        .total,
    ).toBe(0);
  });
  it('uses literal title searches and exact series selection without leaking unrelated issues', async () => {
    expect(
      (await browseSeries('publisher', 1, { ...filters, title: '%_' }, 1, db))
        .total,
    ).toBe(0);
    expect(
      (await browseSeries('publisher', 1, { ...filters, seriesId: 2 }, 1, db))
        .total,
    ).toBe(0);
    expect((await browseIssues('creator', 1, filters, 2, 1, db)).items).toEqual(
      [],
    );
    const parsed = browseFilters(
      new URLSearchParams('title=Alpha&role=writer&owned=1&series=1'),
      'creator',
    );
    expect(parsed).toEqual({
      title: 'Alpha',
      role: 'writer',
      owned: true,
      seriesId: 1,
    });
    expect(
      browseFilters(new URLSearchParams('role=writer'), 'publisher').role,
    ).toBe('');
  });
  it('paginates numeric and fractional issue numbers without truncating the list', async () => {
    await db.run(
      "INSERT INTO variant_credits(variant_id,creator_id,role) VALUES(2,1,'writer')",
    );
    for (let number = 2; number <= 41; number++) {
      const issue = await db.run(
        "INSERT INTO issues(series_id,number,type) VALUES(1,?,'issue')",
        [String(number)],
      );
      const variant = await db.run('INSERT INTO variants(issue_id) VALUES(?)', [
        Number(issue.lastInsertRowid),
      ]);
      await db.run(
        "INSERT INTO variant_credits(variant_id,creator_id,role) VALUES(?,1,'writer')",
        [Number(variant.lastInsertRowid)],
      );
    }
    const first = await browseIssues(
      'creator',
      1,
      { ...filters, role: 'writer' },
      1,
      1,
      db,
    );
    expect(first.total).toBe(42);
    expect(first.items).toHaveLength(40);
    expect(first.hasMore).toBe(true);
    expect(first.items.slice(0, 3).map((i) => i.number)).toEqual([
      '1/2',
      '1',
      '2',
    ]);
    const second = await browseIssues(
      'creator',
      1,
      { ...filters, role: 'writer' },
      1,
      2,
      db,
    );
    expect(second.items.map((i) => i.number)).toEqual(['40', '41']);
    expect(second.hasMore).toBe(false);
  });
  it('filters unspecified credits explicitly without changing all-role behavior', async () => {
    await db.run(
      'INSERT INTO variant_credits(variant_id,creator_id,role) VALUES(2,1,NULL)',
    );
    expect(
      (
        await browseIssues(
          'creator',
          1,
          { ...filters, role: '__unspecified' },
          1,
          1,
          db,
        )
      ).items.map((i) => i.id),
    ).toEqual([2]);
    expect((await browseIssues('creator', 1, filters, 1, 1, db)).total).toBe(2);
  });
});

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  getBox,
  getBoxNavigation,
  listBoxes,
} from '@/features/boxes/repository';
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

describe('boxes repository', () => {
  it('lists boxes with holding, copy and value totals', async () => {
    const boxes = await listBoxes('', 'all', db);

    expect(boxes).toEqual([
      expect.objectContaining({
        id: 1,
        holdingCount: 2,
        copyCount: 3,
        valueCents: 4500,
      }),
      expect.objectContaining({
        id: 3,
        holdingCount: 2,
        copyCount: 2,
        valueCents: 3000,
      }),
    ]);
  });

  it('filters by label and box type', async () => {
    expect((await listBoxes('Short', 'all', db)).map((box) => box.id)).toEqual([
      1,
    ]);
    expect((await listBoxes('', 'long', db)).map((box) => box.id)).toEqual([3]);
  });

  it('returns box contents in collection order', async () => {
    const box = await getBox(1, db);

    expect(box?.label).toBe('Short A');
    expect(box?.holdings.map((holding) => holding.seriesName)).toEqual([
      'Alpha Adventures',
      'Weird Tales',
    ]);
    expect(box?.holdings[0].quantity).toBe(2);
  });

  it('navigates across non-contiguous box IDs', async () => {
    expect(await getBoxNavigation(1, db)).toEqual({
      previousId: null,
      nextId: 3,
    });
    expect(await getBoxNavigation(3, db)).toEqual({
      previousId: 1,
      nextId: null,
    });
  });
});

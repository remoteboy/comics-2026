import { describe, expect, it } from 'vitest';

import { groupBy } from '@/lib/collections';
import {
  formatGrade,
  formatInteger,
  formatLegacyDateTime,
  formatMoney,
  formatMoneyDelta,
  formatPercent,
} from '@/lib/format';
import { positiveInt } from '@/lib/pagination';

describe('format helpers', () => {
  it('formats money and signed deltas', () => {
    expect(formatMoney(1234)).toBe('$12.34');
    expect(formatMoney(null)).toBe('—');
    expect(formatMoneyDelta(500)).toBe('+$5.00');
    expect(formatMoneyDelta(-500)).toBe('−$5.00');
  });

  it('formats grades, percentages and integers', () => {
    expect(formatGrade(94)).toBe('9.4');
    expect(formatGrade(null)).toBe('—');
    expect(formatPercent(12.345)).toBe('+12.3%');
    expect(formatPercent(-5)).toBe('-5.0%');
    expect(formatInteger(12345)).toBe('12,345');
  });

  it('formats valid legacy timestamps and leaves invalid values readable', () => {
    expect(formatLegacyDateTime('2022-06-01 10:00:00')).toContain('2022');
    expect(formatLegacyDateTime('not-a-date')).toBe('not-a-date');
  });
});

describe('positiveInt', () => {
  it('accepts positive integers and falls back otherwise', () => {
    expect(positiveInt('4')).toBe(4);
    expect(positiveInt('0')).toBe(1);
    expect(positiveInt('-1', 2)).toBe(2);
    expect(positiveInt('nope', 7)).toBe(7);
  });
});

describe('groupBy', () => {
  it('groups values without changing their order', () => {
    const groups = groupBy(
      [
        { kind: 'a', value: 1 },
        { kind: 'b', value: 2 },
        { kind: 'a', value: 3 },
      ],
      (item) => item.kind,
    );

    expect(groups.get('a')?.map((item) => item.value)).toEqual([1, 3]);
    expect(groups.get('b')?.map((item) => item.value)).toEqual([2]);
  });
});

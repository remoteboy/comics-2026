import { describe, expect, it } from 'vitest';

import {
  hasMaterialPriceChange,
  movementPercent,
  valueAtGrade,
} from '@/features/valuation/calculate';
import type { ZapIssueConditionRow } from '@/providers/zap/live';
import { providerFixture } from '../../helpers/provider-fixtures';

const conditions = providerFixture(
  'zap-current-conditions.json',
) as ZapIssueConditionRow[];

describe('valuation calculation', () => {
  it('applies the observed Zap condition multiplier for the holding grade', () => {
    expect(valueAtGrade(10_00, 80, conditions)).toEqual({
      gradeTenths: 80,
      priceCents: 700,
      conditionPercentage: 0.7,
    });
  });

  it('does not invent a valuation when the grade is missing from the table', () => {
    expect(valueAtGrade(10_00, 95, conditions)).toBeNull();
    expect(valueAtGrade(10_00, null, conditions)).toBeNull();
  });

  it('records only actual price changes', () => {
    expect(hasMaterialPriceChange(1000, 1000)).toBe(false);
    expect(hasMaterialPriceChange(1000, 1001)).toBe(true);
    expect(hasMaterialPriceChange(null, 1000)).toBe(true);
  });

  it('calculates percentage movement when a comparison price exists', () => {
    expect(movementPercent(1500, 1000)).toBe(50);
    expect(movementPercent(500, 1000)).toBe(-50);
    expect(movementPercent(500, 0)).toBeNull();
    expect(movementPercent(null, 1000)).toBeNull();
  });
});

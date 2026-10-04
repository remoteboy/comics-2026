import type { ZapIssueConditionRow } from '@/providers/zap/live';

export interface GradeValuation {
  gradeTenths: number;
  priceCents: number;
  conditionPercentage: number;
}

export function valueAtGrade(
  nmPriceCents: number,
  gradeTenths: number | null,
  conditions: ZapIssueConditionRow[],
): GradeValuation | null {
  if (gradeTenths === null) return null;

  const condition = conditions.find(
    (item) => Math.round(item.condition * 10) === gradeTenths,
  );

  if (!condition || !Number.isFinite(condition.percentage)) return null;

  return {
    gradeTenths,
    priceCents: Math.round(nmPriceCents * condition.percentage),
    conditionPercentage: condition.percentage,
  };
}

export function hasMaterialPriceChange(
  previousPriceCents: number | null,
  nextPriceCents: number,
): boolean {
  return previousPriceCents === null || previousPriceCents !== nextPriceCents;
}

export function movementPercent(
  currentPriceCents: number | null,
  previousPriceCents: number | null,
): number | null {
  if (
    currentPriceCents === null ||
    previousPriceCents === null ||
    previousPriceCents === 0
  ) {
    return null;
  }

  return ((currentPriceCents - previousPriceCents) * 100) / previousPriceCents;
}

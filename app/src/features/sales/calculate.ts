import { movementPercent } from '@/features/valuation/calculate';

import type {
  SaleCandidateDecision,
  SaleIntelligenceSettings,
  SaleMovementInput,
} from './types';

interface WindowMovement {
  label: string;
  absoluteCents: number;
  percentage: number | null;
}

function movement(
  label: string,
  currentPriceCents: number,
  previousPriceCents: number | null,
): WindowMovement | null {
  if (previousPriceCents === null) return null;

  return {
    label,
    absoluteCents: currentPriceCents - previousPriceCents,
    percentage: movementPercent(currentPriceCents, previousPriceCents),
  };
}

export function evaluateSaleCandidate(
  input: SaleMovementInput,
  settings: SaleIntelligenceSettings,
): SaleCandidateDecision {
  if (
    input.currentPriceCents === null ||
    input.currentPriceCents < settings.minimumCurrentValueCents
  ) {
    return {
      qualifies: false,
      bestAbsoluteMovementCents: null,
      bestPercentageMovement: null,
      reasons: [],
    };
  }

  const windows = [
    movement('30-day', input.currentPriceCents, input.price30DaysCents),
    movement('90-day', input.currentPriceCents, input.price90DaysCents),
  ].filter((item): item is WindowMovement => item !== null);
  const positive = windows.filter((item) => item.absoluteCents > 0);

  if (positive.length === 0) {
    return {
      qualifies: false,
      bestAbsoluteMovementCents: 0,
      bestPercentageMovement: 0,
      reasons: [],
    };
  }

  const bestAbsoluteMovementCents = Math.max(
    ...positive.map((item) => item.absoluteCents),
  );
  const percentages = positive
    .map((item) => item.percentage)
    .filter((value): value is number => value !== null);
  const bestPercentageMovement =
    percentages.length > 0 ? Math.max(...percentages) : null;
  const reasons: string[] = [];

  const absoluteWindow = positive.find(
    (item) => item.absoluteCents >= settings.minimumAbsoluteMovementCents,
  );
  if (absoluteWindow) reasons.push(`${absoluteWindow.label} absolute increase`);

  const percentageWindow = positive.find(
    (item) =>
      item.percentage !== null &&
      item.percentage >= settings.minimumPercentageMovement,
  );
  if (percentageWindow)
    reasons.push(`${percentageWindow.label} percentage spike`);

  return {
    qualifies: reasons.length > 0,
    bestAbsoluteMovementCents,
    bestPercentageMovement,
    reasons,
  };
}

export function ebayResearchUrl(
  seriesName: string,
  issueNumber: string,
  variantName = '',
): string {
  const query = [seriesName, `#${issueNumber}`, variantName]
    .filter(Boolean)
    .join(' ');
  const params = new URLSearchParams({
    _nkw: query,
    LH_Sold: '1',
    LH_Complete: '1',
  });
  return `https://www.ebay.com/sch/i.html?${params.toString()}`;
}

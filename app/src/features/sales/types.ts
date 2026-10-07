export interface SaleIntelligenceSettings {
  minimumCurrentValueCents: number;
  minimumAbsoluteMovementCents: number;
  minimumPercentageMovement: number;
}

export interface SaleMovementInput {
  currentPriceCents: number | null;
  price30DaysCents: number | null;
  price90DaysCents: number | null;
}

export interface SaleCandidateDecision {
  qualifies: boolean;
  bestAbsoluteMovementCents: number | null;
  bestPercentageMovement: number | null;
  reasons: string[];
}

export interface SaleCandidateRow extends SaleMovementInput {
  holdingId: number;
  variantId: number;
  seriesName: string;
  issueNumber: string;
  issueType: 'issue' | 'annual';
  variantName: string;
  gradeTenths: number | null;
  quantity: number;
  imageKey: string | null;
  valuationProvider: string | null;
  refreshedAt: string | null;
  providerVariantId: string | null;
  watched: number;
  notes: string | null;
}

export interface SaleCandidate extends SaleCandidateRow {
  qualifies: boolean;
  bestAbsoluteMovementCents: number | null;
  bestPercentageMovement: number | null;
  reasons: string[];
  ebayResearchUrl: string;
}

export interface SaleSummary {
  automaticCandidates: number;
  watchedHoldings: number;
  candidateValueCents: number;
}

export interface SoldCompCacheRow {
  providerVariantId: string;
  fetchedAt: string;
  responseJson: string;
}

export interface SoldCompTarget {
  holdingId: number;
  seriesName: string;
  issueNumber: string;
  issueType: 'issue' | 'annual';
  variantName: string;
  publisherName: string | null;
  coverPriceCents: number | null;
  gradeTenths: number | null;
  sourcePriceCents: number | null;
  zapSeriesId: string;
  zapVariantId: string;
}

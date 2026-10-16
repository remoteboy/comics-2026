export interface PriceSnapshot {
  coverName: string | null;
  valuationEpoch: number;
  variantId: number | null;
  id: number;
  provider: string;
  gradeTenths: number | null;
  priceCents: number;
  observedAt: string;
}

export interface CurrentValuation {
  holdingId: number;
  provider: string;
  providerVariantId: string | null;
  gradeTenths: number | null;
  priceCents: number | null;
  sourcePriceCents: number | null;
  conditionPercentage: number | null;
  observedAt: string | null;
  refreshedAt: string;
}

export interface ZapValuationTarget {
  editVersion: number;
  holdingId: number;
  variantId: number;
  zapVariantId: string;
  gradeTenths: number | null;
  currentValueCents: number | null;
}

export interface ValuationWrite {
  expectedEditVersion?: number;
  holdingId: number;
  providerVariantId: string;
  gradeTenths: number;
  priceCents: number;
  sourcePriceCents: number;
  conditionPercentage: number;
  observedAt: string;
  refreshedAt: string;
  syncRunId: number | null;
}

export interface ValuationHealthSummary {
  totalHoldings: number;
  liveHoldings: number;
  freshHoldings: number;
  staleLiveHoldings: number;
  legacyHoldings: number;
  missingHoldings: number;
  latestRefreshAt: string | null;
}

export interface ValuationBackfillProgress {
  totalZapVariants: number;
  checkedVariants: number;
  pendingVariants: number;
  noPriceVariants: number;
  unresolvedVariants: number;
  failedVariants: number;
  legacyMappedHoldings: number;
  unmappedHoldings: number;
}

export interface ValuationMovement {
  holdingId: number;
  variantId: number;
  seriesName: string;
  issueNumber: string;
  variantName: string;
  gradeTenths: number | null;
  currentPriceCents: number | null;
  price30DaysCents: number | null;
  price90DaysCents: number | null;
  firstPriceCents: number | null;
  refreshedAt: string;
}

export interface ValuationSyncRun {
  id: number;
  provider: string;
  startedAt: string;
  completedAt: string | null;
  status: 'running' | 'success' | 'failed' | 'partial';
  statsJson: string | null;
  errorText: string | null;
}

export interface ValuationSyncStats {
  mode: 'recent' | 'backfill' | 'scheduled';
  pages: number;
  providerRequests: number;
  providerRows: number;
  ownedRows: number;
  selectedVariants: number;
  pricedVariants: number;
  noPriceVariants: number;
  failedVariants: number;
  refreshedHoldings: number;
  changedHoldings: number;
  unchangedHoldings: number;
  skippedHoldings: number;
}

export interface ValuationSyncResult {
  runId: number;
  status: 'success' | 'partial';
  stats: ValuationSyncStats;
}

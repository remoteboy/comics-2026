export interface DashboardSummary {
  collectionValueCents: number;
  physicalCopies: number;
  seriesCount: number;
  boxCount: number;
  boxedCopies: number;
  unboxedCopies: number;
  valuedHoldings: number;
  unvaluedHoldings: number;
  zeroValueHoldings: number;
  staleValuedHoldings: number;
  priceSnapshotCount: number;
  latestValuationAt: string | null;
}

export interface ValuableHolding {
  holdingId: number;
  variantId: number;
  seriesName: string;
  issueNumber: string;
  variantName: string;
  gradeTenths: number | null;
  valueCents: number | null;
  quantity: number;
  boxId: number | null;
  imageKey: string | null;
}

export interface ValuationChange extends ValuableHolding {
  observedAt: string;
  previousPriceCents: number | null;
  snapshotPriceCents: number;
  deltaCents: number | null;
  changePercent: number | null;
}

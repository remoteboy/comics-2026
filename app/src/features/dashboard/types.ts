export interface DashboardSummary {
  collectionValueCents: number;
  physicalCopies: number;
  seriesCount: number;
  boxedCopies: number;
  unboxedCopies: number;
  unvaluedHoldings: number;
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
  changePercent: number | null;
}

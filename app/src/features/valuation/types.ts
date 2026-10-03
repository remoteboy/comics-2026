export interface PriceSnapshot {
  id: number;
  provider: string;
  gradeTenths: number | null;
  priceCents: number;
  observedAt: string;
}

export type SeriesStatus = 'ongoing' | 'ended';
export type SeriesHealthFilter =
  'all' | 'missing-value' | 'zero-value' | 'unboxed' | 'stale-value';
export type SeriesSort = 'title' | 'value' | 'copies' | 'issues';

export interface SeriesListOptions {
  query: string;
  page: number;
  perPage?: number;
  status?: SeriesStatus | 'all';
  health?: SeriesHealthFilter;
  sort?: SeriesSort;
}

export interface SeriesListItem {
  id: number;
  name: string;
  startYear: number | null;
  status: SeriesStatus;
  publishers: string[];
  issueCount: number;
  variantCount: number;
  copyCount: number;
  valueCents: number;
}

export interface SeriesListResult {
  items: SeriesListItem[];
  total: number;
}

export interface SeriesDetail {
  id: number;
  name: string;
  startYear: number | null;
  status: SeriesStatus;
  publishers: string[];
  issueCount: number;
  ownedVariants: number;
  physicalCopies: number;
  boxCount: number;
  valueCents: number;
  unboxedCopies: number;
  unvaluedHoldings: number;
}

export interface HoldingListItem {
  holdingId: number;
  variantId: number;
  issueNumber: string;
  issueType: 'issue' | 'annual';
  variantName: string;
  gradeTenths: number | null;
  quantity: number;
  boxId: number | null;
  valueCents: number | null;
  imageKey: string | null;
  firstAppearanceOf: string | null;
}

export interface VariantDetail {
  id: number;
  seriesId: number;
  seriesName: string;
  issueNumber: string;
  issueType: 'issue' | 'annual';
  variantName: string;
  storyTitle: string | null;
  firstAppearanceOf: string | null;
  details: string | null;
  publisherName: string | null;
  coverPriceCents: number | null;
  imageKey: string | null;
}

export interface VariantCredit {
  name: string;
  role: string | null;
}

export interface ExternalReference {
  provider: string;
  externalId: string;
}

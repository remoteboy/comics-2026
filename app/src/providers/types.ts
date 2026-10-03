export type ProviderId = 'zap' | 'comic_vine';
export type ProviderIssueType = 'issue' | 'annual';

export interface ProviderCreatorCredit {
  externalId: string | null;
  name: string;
  roles: string[];
}

export interface ProviderImageSet {
  original: string | null;
  large: string | null;
  medium: string | null;
  thumbnail: string | null;
}

export interface NormalizedSeriesResult {
  provider: ProviderId;
  externalId: string;
  name: string;
  startYear: number | null;
  publisher: string | null;
}

export interface NormalizedIssueResult {
  provider: ProviderId;
  externalId: string;
  seriesExternalId: string | null;
  number: string;
  type: ProviderIssueType;
  storyTitle: string | null;
  description: string | null;
  firstAppearanceOf: string | null;
  coverDate: string | null;
  releaseDate: string | null;
  keyIssue: boolean;
  creators: ProviderCreatorCredit[];
  images: ProviderImageSet | null;
}

export interface NormalizedVariantResult {
  provider: ProviderId;
  externalId: string;
  issueExternalId: string | null;
  label: string;
  imageUrl: string | null;
  coverPriceCents: number | null;
  coverIndex: number | null;
  creators: ProviderCreatorCredit[];
}

export interface NormalizedValuationResult {
  provider: ProviderId;
  variantExternalId: string;
  gradeTenths: number;
  priceCents: number;
  currency: 'USD';
  conditionLabel: string | null;
}

export interface NormalizedUpdateResult {
  provider: ProviderId;
  variantExternalId: string;
  seriesExternalId: string | null;
  seriesName: string | null;
  number: string;
  variantLabel: string;
  type: ProviderIssueType;
  gradeTenths: number | null;
  currentPriceCents: number | null;
  previousPriceCents: number | null;
  firstAppearanceOf: string | null;
  updatedAt: string | null;
  isNew: boolean;
}

export interface ProviderAdapter {
  readonly id: ProviderId;
  normalizeSeries(payload: unknown): NormalizedSeriesResult | null;
  normalizeIssue(payload: unknown): NormalizedIssueResult | null;
  normalizeVariants(payload: unknown): NormalizedVariantResult[];
  normalizeValuations(payload: unknown): NormalizedValuationResult[];
  normalizeUpdates(payload: unknown): NormalizedUpdateResult[];
}

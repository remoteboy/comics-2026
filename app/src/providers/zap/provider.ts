import type { ProviderAdapter } from '../types';
import {
  normalizeZapIssue,
  normalizeZapSeries,
  normalizeZapVariants,
} from './catalog';
import { normalizeZapUpdates } from './updates';
import { normalizeZapValuations } from './valuation';

export class RecordedZapProvider implements ProviderAdapter {
  readonly id = 'zap' as const;

  normalizeSeries = normalizeZapSeries;
  normalizeIssue = normalizeZapIssue;
  normalizeVariants = normalizeZapVariants;
  normalizeValuations = normalizeZapValuations;
  normalizeUpdates = normalizeZapUpdates;
}

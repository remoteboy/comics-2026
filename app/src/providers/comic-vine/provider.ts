import type {
  NormalizedUpdateResult,
  NormalizedValuationResult,
  ProviderAdapter,
} from '../types';
import {
  normalizeComicVineIssue,
  normalizeComicVineSeries,
  normalizeComicVineVariants,
} from './catalog';

export class RecordedComicVineProvider implements ProviderAdapter {
  readonly id = 'comic_vine' as const;

  normalizeSeries = normalizeComicVineSeries;
  normalizeIssue = normalizeComicVineIssue;
  normalizeVariants = normalizeComicVineVariants;

  normalizeValuations(_payload: unknown): NormalizedValuationResult[] {
    return [];
  }

  normalizeUpdates(_payload: unknown): NormalizedUpdateResult[] {
    return [];
  }
}

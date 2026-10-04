import type {
  NormalizedIssueResult,
  NormalizedSeriesResult,
  NormalizedVariantResult,
  ProviderCreatorCredit,
} from '../../types';
import {
  asArray,
  asRecord,
  booleanFlag,
  moneyToCents,
  nonEmptyString,
  normalizeIssueType,
  yearFromName,
} from '../../utils';

function creator(name: unknown, role: string): ProviderCreatorCredit | null {
  const normalizedName = nonEmptyString(name);
  return normalizedName
    ? { externalId: null, name: normalizedName, roles: [role] }
    : null;
}

function creators(record: Record<string, unknown>): ProviderCreatorCredit[] {
  return [
    creator(record.writer, 'writer'),
    creator(record.penciller, 'penciller'),
    creator(record.inker, 'inker'),
    creator(record.cover_artist, 'cover_artist'),
  ].filter((credit): credit is ProviderCreatorCredit => credit !== null);
}

function firstRecord(payload: unknown): Record<string, unknown> | null {
  const direct = asRecord(payload);
  if (direct) return direct;

  const [first] = asArray(payload);
  return asRecord(first);
}

function images(record: Record<string, unknown>) {
  const cover = nonEmptyString(record.cover_url);
  return cover
    ? {
        original: cover,
        large: cover,
        medium: cover,
        thumbnail: cover,
      }
    : null;
}

export function normalizeCurrentZapSeries(
  payload: unknown,
): NormalizedSeriesResult | null {
  const row = asRecord(payload);
  if (!row) return null;

  const externalId = nonEmptyString(row.id);
  const name = nonEmptyString(row.name);
  if (!externalId || !name) return null;

  return {
    provider: 'zap',
    externalId,
    name,
    startYear: yearFromName(name),
    publisher: null,
  };
}

export function normalizeCurrentZapIssue(
  payload: unknown,
): NormalizedIssueResult | null {
  const issue = firstRecord(payload);
  if (!issue) return null;

  const externalId = nonEmptyString(issue.id);
  const number = nonEmptyString(issue.number);
  if (!externalId || !number) return null;

  return {
    provider: 'zap',
    externalId,
    seriesExternalId: nonEmptyString(issue.title_id),
    number,
    type: normalizeIssueType(issue.issue_type_name),
    storyTitle: nonEmptyString(issue.story_title),
    description: nonEmptyString(issue.details),
    firstAppearanceOf: nonEmptyString(issue.first_appearance_of),
    coverDate: nonEmptyString(issue.cover_date),
    releaseDate: null,
    keyIssue: booleanFlag(issue.key_issue),
    creators: creators(issue),
    images: images(issue),
  };
}

function normalizeVariant(payload: unknown): NormalizedVariantResult | null {
  const issue = asRecord(payload);
  if (!issue) return null;

  const externalId = nonEmptyString(issue.id);
  if (!externalId) return null;

  return {
    provider: 'zap',
    externalId,
    issueExternalId: null,
    label: nonEmptyString(issue.variant) ?? '',
    imageUrl: nonEmptyString(issue.cover_url),
    coverPriceCents: moneyToCents(issue.cover_price),
    coverIndex: null,
    creators: creators(issue),
  };
}

export function normalizeCurrentZapVariants(
  payload: unknown,
): NormalizedVariantResult[] {
  const root = asRecord(payload);
  return asArray(root?.issues)
    .map(normalizeVariant)
    .filter((variant): variant is NormalizedVariantResult => variant !== null);
}

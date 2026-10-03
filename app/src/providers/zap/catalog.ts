import type {
  NormalizedIssueResult,
  NormalizedSeriesResult,
  NormalizedVariantResult,
  ProviderCreatorCredit,
} from '../types';
import {
  asArray,
  asRecord,
  booleanFlag,
  moneyToCents,
  nonEmptyString,
  normalizeIssueType,
  yearFromName,
} from '../utils';
import { zapIssuePayload } from './payload';

function creator(name: unknown, role: string): ProviderCreatorCredit | null {
  const normalizedName = nonEmptyString(name);
  return normalizedName
    ? { externalId: null, name: normalizedName, roles: [role] }
    : null;
}

export function zapCreators(payload: unknown): ProviderCreatorCredit[] {
  const parsed = zapIssuePayload(payload);
  if (!parsed) return [];

  const credits = [
    creator(parsed.issue.writer, 'writer'),
    creator(parsed.issue.penciller, 'penciller'),
    creator(parsed.issue.inker, 'inker'),
    creator(parsed.issue.cover_artist, 'cover_artist'),
  ].filter((credit): credit is ProviderCreatorCredit => credit !== null);

  if (credits.length) return credits;

  const recorded = asRecord(parsed.wrapper.creators);
  if (!recorded) return [];

  return Object.entries(recorded).flatMap(([role, names]) =>
    asArray(names)
      .map((name) => creator(name, role))
      .filter((credit): credit is ProviderCreatorCredit => credit !== null),
  );
}

export function normalizeZapSeries(
  payload: unknown,
): NormalizedSeriesResult | null {
  const parsed = zapIssuePayload(payload);
  if (!parsed) return null;

  const name = nonEmptyString(parsed.issue.title_name);
  const externalId = nonEmptyString(parsed.issue.title_id);
  if (!name || !externalId) return null;

  return {
    provider: 'zap',
    externalId,
    name,
    startYear: yearFromName(name),
    publisher: nonEmptyString(parsed.issue.publisher),
  };
}

export function normalizeZapIssue(
  payload: unknown,
): NormalizedIssueResult | null {
  const parsed = zapIssuePayload(payload);
  if (!parsed) return null;

  const variantExternalId =
    nonEmptyString(parsed.issue.id) ?? nonEmptyString(parsed.wrapper.remote_id);
  const number =
    nonEmptyString(parsed.issue.number) ??
    nonEmptyString(parsed.wrapper.number);
  if (!variantExternalId || !number) return null;

  const issueExternalId =
    nonEmptyString(parsed.issue.primary_issue_id) ?? variantExternalId;

  return {
    provider: 'zap',
    externalId: issueExternalId,
    seriesExternalId: nonEmptyString(parsed.issue.title_id),
    number,
    type: normalizeIssueType(parsed.issue.issue_type_name),
    storyTitle:
      nonEmptyString(parsed.issue.story_title) ??
      nonEmptyString(parsed.wrapper.story_title),
    description:
      nonEmptyString(parsed.issue.details) ??
      nonEmptyString(parsed.wrapper.details),
    firstAppearanceOf:
      nonEmptyString(parsed.issue.first_appearance_of) ??
      nonEmptyString(parsed.wrapper.first_appearance_of),
    coverDate: nonEmptyString(parsed.issue.cover_date),
    releaseDate: null,
    keyIssue: booleanFlag(parsed.issue.key_issue),
    creators: zapCreators(payload),
    images: null,
  };
}

function normalizeZapVariantRecord(
  record: unknown,
): NormalizedVariantResult | null {
  const comic = asRecord(record);
  if (!comic) return null;

  const externalId = nonEmptyString(comic.id);
  if (!externalId) return null;

  return {
    provider: 'zap',
    externalId,
    issueExternalId: nonEmptyString(comic.primary_issue_id) ?? externalId,
    label: nonEmptyString(comic.variant) ?? '',
    imageUrl: `https://comics.zapkapowcomics.com/image.php?id=${externalId}`,
    coverPriceCents: moneyToCents(comic.cover_price),
    coverIndex: null,
    creators: [],
  };
}

export function normalizeZapVariants(
  payload: unknown,
): NormalizedVariantResult[] {
  const root = asRecord(payload);
  const comics = asArray(root?.comics);
  if (comics.length) {
    return comics
      .map(normalizeZapVariantRecord)
      .filter(
        (variant): variant is NormalizedVariantResult => variant !== null,
      );
  }

  const parsed = zapIssuePayload(payload);
  if (!parsed) return [];

  const externalId =
    nonEmptyString(parsed.issue.id) ?? nonEmptyString(parsed.wrapper.remote_id);
  if (!externalId) return [];

  return [
    {
      provider: 'zap',
      externalId,
      issueExternalId:
        nonEmptyString(parsed.issue.primary_issue_id) ?? externalId,
      label:
        nonEmptyString(parsed.issue.variant) ??
        nonEmptyString(parsed.wrapper.variant) ??
        '',
      imageUrl:
        nonEmptyString(parsed.wrapper.image) ??
        `https://comics.zapkapowcomics.com/image.php?id=${externalId}`,
      coverPriceCents: moneyToCents(parsed.issue.cover_price),
      coverIndex: null,
      creators: zapCreators(payload),
    },
  ];
}

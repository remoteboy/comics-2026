import type {
  NormalizedIssueResult,
  NormalizedSeriesResult,
  NormalizedVariantResult,
  ProviderCreatorCredit,
  ProviderImageSet,
} from '../types';
import {
  asArray,
  asRecord,
  nonEmptyString,
  normalizeIssueType,
  normalizeRole,
  yearFromName,
} from '../utils';
import { comicVineIssuePayload, comicVineSyntheticId } from './payload';

function comicVineExternalId(
  prefix: '4000' | '4040' | '4050',
  id: unknown,
): string | null {
  const normalized = nonEmptyString(id);
  return normalized ? `${prefix}-${normalized}` : null;
}

function firstAppearance(value: unknown): string | null {
  const names = asArray(value)
    .map((item) => nonEmptyString(asRecord(item)?.name))
    .filter((name): name is string => name !== null);
  return names.length ? names.join(', ') : null;
}

function stripCoverList(value: unknown): string | null {
  const description = nonEmptyString(value);
  if (!description) return null;
  return (
    description
      .split('<h4>List of covers and their creators:</h4>')[0]
      .trim() || null
  );
}

function imageSet(value: unknown): ProviderImageSet | null {
  const images = asRecord(value);
  if (!images) return null;

  return {
    original: nonEmptyString(images.original_url),
    large:
      nonEmptyString(images.super_url) ??
      nonEmptyString(images.screen_large_url),
    medium:
      nonEmptyString(images.medium_url) ?? nonEmptyString(images.screen_url),
    thumbnail:
      nonEmptyString(images.thumb_url) ?? nonEmptyString(images.icon_url),
  };
}

export function comicVineCreators(payload: unknown): ProviderCreatorCredit[] {
  const parsed = comicVineIssuePayload(payload);
  if (!parsed) return [];

  return asArray(parsed.issue.person_credits).flatMap((value) => {
    const credit = asRecord(value);
    const name = nonEmptyString(credit?.name);
    if (!credit || !name) return [];

    const roles = (nonEmptyString(credit.role) ?? '')
      .split(',')
      .map(normalizeRole)
      .filter(Boolean);

    return [
      {
        externalId: comicVineExternalId('4040', credit.id),
        name,
        roles,
      },
    ];
  });
}

export function normalizeComicVineSeries(
  payload: unknown,
): NormalizedSeriesResult | null {
  const parsed = comicVineIssuePayload(payload);
  if (!parsed) return null;

  const volume = asRecord(parsed.issue.volume);
  const name = nonEmptyString(volume?.name);
  const externalId = comicVineExternalId('4050', volume?.id);
  if (!name || !externalId) return null;

  return {
    provider: 'comic_vine',
    externalId,
    name,
    startYear: yearFromName(name),
    publisher: null,
  };
}

export function normalizeComicVineIssue(
  payload: unknown,
): NormalizedIssueResult | null {
  const parsed = comicVineIssuePayload(payload);
  if (!parsed) return null;

  const synthetic = comicVineSyntheticId(parsed.wrapper.remote_id);
  const issueExternalId =
    synthetic?.issueExternalId ?? comicVineExternalId('4000', parsed.issue.id);
  const number =
    nonEmptyString(parsed.issue.issue_number) ??
    nonEmptyString(parsed.wrapper.number);
  if (!issueExternalId || !number) return null;

  const volume = asRecord(parsed.issue.volume);

  return {
    provider: 'comic_vine',
    externalId: issueExternalId,
    seriesExternalId: comicVineExternalId('4050', volume?.id),
    number,
    type: normalizeIssueType(parsed.wrapper.type),
    storyTitle:
      nonEmptyString(parsed.issue.name) ??
      nonEmptyString(parsed.wrapper.story_title),
    description:
      stripCoverList(parsed.issue.description) ??
      nonEmptyString(parsed.wrapper.details),
    firstAppearanceOf:
      firstAppearance(parsed.issue.first_appearance_characters) ??
      nonEmptyString(parsed.wrapper.first_appearance_of),
    coverDate: nonEmptyString(parsed.issue.cover_date),
    releaseDate: nonEmptyString(parsed.issue.store_date),
    keyIssue: false,
    creators: comicVineCreators(payload),
    images: imageSet(parsed.issue.image),
  };
}

export function normalizeComicVineVariants(
  payload: unknown,
): NormalizedVariantResult[] {
  const parsed = comicVineIssuePayload(payload);
  if (!parsed) return [];

  const externalId =
    nonEmptyString(parsed.wrapper.remote_id) ??
    comicVineExternalId('4000', parsed.issue.id);
  const synthetic = comicVineSyntheticId(externalId);
  if (!externalId || !synthetic) return [];

  return [
    {
      provider: 'comic_vine',
      externalId,
      issueExternalId: synthetic.issueExternalId,
      label: nonEmptyString(parsed.wrapper.variant) ?? '',
      imageUrl: nonEmptyString(parsed.wrapper.image),
      coverPriceCents: null,
      coverIndex: synthetic.coverIndex,
      creators: comicVineCreators(payload),
    },
  ];
}

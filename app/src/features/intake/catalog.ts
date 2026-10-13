import { database } from '@/db';
import type { MutationDatabase } from '@/db/database';
import {
  createZapSupabaseClient,
  normalizeCurrentZapIssue,
  normalizeCurrentZapVariants,
  zapLiveConfig,
} from '@/providers/zap/live';
import { yearFromName } from '@/providers/utils';
import type { ProviderIssueType } from '@/providers/types';
import type {
  IntakeCover,
  IntakeLookup,
  IntakeTitle,
  IntakeZapClient,
} from './types';

export class IntakeLookupError extends Error {}
export class IntakeMetadataUnavailable extends IntakeLookupError {}
export function intakeZapClient(): IntakeZapClient {
  const config = zapLiveConfig();
  if (!config.publishableKey || !(config.accessToken || config.refreshToken))
    throw new IntakeLookupError(
      'Zap is not configured. Check Providers or use manual entry.',
    );
  return createZapSupabaseClient(config);
}
export async function searchZapTitles(
  query: string,
  client: IntakeZapClient = intakeZapClient(),
): Promise<IntakeTitle[]> {
  if (query.trim().length < 2 || query.length > 200)
    throw new IntakeLookupError(
      'Enter at least two characters of the title name.',
    );
  try {
    const rows = await client.searchTitles(query.trim(), 30);
    if (!Array.isArray(rows)) throw new Error('Invalid title search response.');
    return rows.flatMap((row) =>
      Number.isSafeInteger(row.id) &&
      row.id > 0 &&
      typeof row.name === 'string' &&
      typeof row.slug === 'string' &&
      row.slug
        ? [
            {
              source: 'zap' as const,
              externalId: String(row.id),
              name: row.name,
              slug: row.slug,
              year: yearFromName(row.name),
              publisher: null,
            },
          ]
        : [],
    );
  } catch {
    throw new IntakeLookupError(
      'Zap title search is unavailable. Retry or use manual entry.',
    );
  }
}
export function issueNumber(value: string): string {
  const normalized = value.trim();
  if (!normalized || normalized.length > 40 || /[\x00-\x1f<>]/.test(normalized))
    throw new IntakeLookupError(
      'Enter an issue number, such as 1, 1/2 or 12.1.',
    );
  return normalized;
}
export async function discoverZapCovers(
  title: IntakeTitle,
  number: string,
  type: ProviderIssueType,
  client: IntakeZapClient = intakeZapClient(),
): Promise<IntakeCover[]> {
  const requested = issueNumber(number);
  const covers = new Map<string, IntakeCover>();
  const seen = new Set<number>();
  let processed = 0;
  let total: number | undefined;
  for (let page = 1; page <= 100; page++) {
    let result;
    try {
      result = await client.issuesForTitle({
        titleSlug: title.slug,
        issueNumber: requested,
        page,
        pageSize: 100,
        issueTypeIds: [type === 'annual' ? 2 : 1],
      });
    } catch {
      throw new IntakeLookupError(
        'Zap cover lookup failed before all pages were received. Retry or use manual entry.',
      );
    }
    if (
      !result ||
      !Array.isArray(result.issues) ||
      !Number.isSafeInteger(result.total_count) ||
      result.total_count < 0 ||
      (total !== undefined && total !== result.total_count)
    )
      throw new IntakeLookupError(
        'Zap returned incomplete or changing cover results. Retry the lookup.',
      );
    total = result.total_count;
    if (!result.issues.length && processed < total)
      throw new IntakeLookupError(
        'Zap returned an incomplete cover list. Retry the lookup.',
      );
    for (const row of result.issues) {
      if (
        !Number.isSafeInteger(row.id) ||
        row.id < 1 ||
        String(row.title_id) !== title.externalId ||
        row.title_slug_out !== title.slug ||
        typeof row.number !== 'string' ||
        typeof row.issue_slug_out !== 'string' ||
        !row.issue_slug_out
      )
        throw new IntakeLookupError(
          'Zap returned cover identities that could not be verified.',
        );
      if (seen.has(row.id))
        throw new IntakeLookupError(
          'Zap repeated a cover before completing the list. Retry the lookup.',
        );
      seen.add(row.id);
      if (
        row.number.trim().toLocaleLowerCase() !==
          requested.toLocaleLowerCase() ||
        row.issue_type_id !== (type === 'annual' ? 2 : 1)
      )
        continue;
      covers.set(String(row.id), {
        externalId: String(row.id),
        slug: row.issue_slug_out,
        number: row.number.trim(),
        type,
        label: row.variant ?? '',
        imageUrl:
          row.cover_url?.trim() &&
          !/^https:\/\/(?:club|comics)\.zapkapowcomics\.com\/image\.php(?:\?|$)/i.test(
            row.cover_url.trim(),
          )
            ? row.cover_url.trim()
            : `https://zkc-club-covers.s3.us-east-1.amazonaws.com/${row.id}.jpg`,
        metadata: {
          issue: normalizeCurrentZapIssue({
            ...row,
            issue_type_name: type === 'annual' ? 'Annual' : 'Issue',
          })!,
          variant: normalizeCurrentZapVariants({ issues: [row] })[0],
          publisher: row.publisher,
        },
      });
    }
    processed += result.issues.length;
    if (processed > total)
      throw new IntakeLookupError(
        'Zap returned inconsistent cover counts. Retry the lookup.',
      );
    if (processed === total) return [...covers.values()];
  }
  throw new IntakeLookupError(
    'This lookup is too large to complete safely. Try a more specific issue number.',
  );
}
// Page identities are scoped to each lookup, not shared between requests.

export async function zapCoverMetadata(
  lookup: IntakeLookup,
  cover: IntakeCover,
  client: IntakeZapClient = intakeZapClient(),
) {
  let detail;
  try {
    detail = await client.issueDetails(lookup.title.slug, cover.slug);
  } catch {
    throw new IntakeMetadataUnavailable(
      'Zap could not load the selected cover details. Your collection has not changed. Retry or use manual entry.',
    );
  }
  const issue = normalizeCurrentZapIssue(detail);
  const variant = normalizeCurrentZapVariants({ issues: [detail] })[0];
  if (
    !issue ||
    !variant ||
    issue.externalId !== cover.externalId ||
    variant.externalId !== cover.externalId ||
    issue.seriesExternalId !== lookup.title.externalId ||
    issue.number.trim().toLocaleLowerCase() !==
      lookup.issueNumber.toLocaleLowerCase() ||
    issue.type !== lookup.issueType ||
    detail.title_slug_out !== lookup.title.slug ||
    detail.issue_slug_out !== cover.slug
  )
    throw new IntakeLookupError(
      'The selected cover no longer matches this title, issue and type. Look up the covers again.',
    );
  return { issue, variant, publisher: detail.publisher };
}
export async function storeIntakeLookups(
  lookups: IntakeLookup[],
  db: MutationDatabase = database(),
): Promise<string[]> {
  if (
    lookups.some(
      (lookup) =>
        new TextEncoder().encode(JSON.stringify(lookup)).length > 1_500_000,
    )
  )
    throw new IntakeLookupError(
      'This cover list is too large to display completely. Use manual entry for the cover you purchased.',
    );
  const now = new Date();
  for (const lookup of lookups)
    for (const cover of lookup.covers) {
      const images = await db.all<{ id: number; imageKey: string | null }>(
        "SELECT DISTINCT v.id,v.image_key AS imageKey FROM variants v JOIN issues i ON i.id=v.issue_id JOIN external_refs er ON er.entity_type='variant' AND er.entity_id=v.id WHERE er.provider=? AND er.external_id=? AND i.number=? COLLATE NOCASE AND i.type=?",
        [
          lookup.title.source,
          cover.externalId,
          lookup.issueNumber,
          lookup.issueType,
        ],
      );
      if (images.length === 1) cover.imageKey = images[0].imageKey;
    }
  const ids = lookups.map(() => crypto.randomUUID());
  await db.batch([
    {
      sql: 'DELETE FROM intake_lookups WHERE expires_at < ?',
      parameters: [new Date(now.getTime() - 48 * 60 * 60 * 1000).toISOString()],
    },
    ...lookups.map((lookup, index) => ({
      sql: 'INSERT INTO intake_lookups(id,payload_json,expires_at) VALUES (?,?,?)',
      parameters: [
        ids[index],
        JSON.stringify(lookup),
        new Date(now.getTime() + 6 * 60 * 60 * 1000).toISOString(),
      ],
    })),
  ]);
  return ids;
}
export async function storeIntakeLookup(
  lookup: IntakeLookup,
  db: MutationDatabase = database(),
): Promise<string> {
  return (await storeIntakeLookups([lookup], db))[0];
}
export async function loadIntakeLookup(
  id: string,
  db: MutationDatabase = database(),
  displayExpired = false,
): Promise<IntakeLookup> {
  const row = await db.get<{ payload: string }>(
    `SELECT payload_json AS payload FROM intake_lookups WHERE id = ? ${displayExpired ? '' : 'AND expires_at > ?'}`,
    displayExpired ? [id] : [id, new Date().toISOString()],
  );
  if (!row)
    throw new IntakeLookupError(
      'This cover lookup has expired. Look up the issue again; your collection has not changed.',
    );
  return JSON.parse(row.payload) as IntakeLookup;
}
export async function validateLocalTitle(
  title: IntakeTitle,
  localSeriesId: number | null,
  db: MutationDatabase = database(),
) {
  if (localSeriesId === null) return;
  if (
    !Number.isSafeInteger(localSeriesId) ||
    localSeriesId < 1 ||
    !(await db.get('SELECT id FROM series WHERE id = ?', [localSeriesId]))
  )
    throw new IntakeLookupError('That collection title no longer exists.');
  const refs = await db.all<{ id: number; externalId: string }>(
    "SELECT entity_id AS id,external_id AS externalId FROM external_refs WHERE entity_type='series' AND provider=? AND (entity_id=? OR external_id=?)",
    [title.source, localSeriesId, title.externalId],
  );
  if (
    refs.some(
      (ref) => ref.id !== localSeriesId || ref.externalId !== title.externalId,
    )
  )
    throw new IntakeLookupError(
      'This provider title is already linked to a different collection title. Choose the matching title or use manual entry.',
    );
}

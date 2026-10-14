import { database } from '@/db';
import type { QueryDatabase } from '@/db/database';
import { ComicVineIntakeClient } from '@/features/intake/comic-vine';
import {
  discoverZapCovers,
  intakeZapClient,
  zapCoverMetadata,
} from '@/features/intake/catalog';
import type { IntakeZapClient } from '@/features/intake/types';
import type { NormalizedIssueResult } from '@/providers/types';
import { normalizeRole, nonEmptyString } from '@/providers/utils';
import { getEditableMetadata, MetadataEditConflict } from './metadata-edit';
import { readableNotes } from './readable-notes';

export class MetadataLookupError extends Error {}

export type MetadataSource = 'zap' | 'comic_vine';
export interface MetadataSuggestions {
  storyTitle: string | null;
  firstAppearanceOf: string | null;
  publisherName: string | null;
  coverPriceCents: number | null;
  details: string | null;
  credits: { name: string; role: string | null }[];
  notice: string;
}
interface Reference {
  externalId: string;
  metadata: string | null;
}

export async function metadataSources(
  id: number,
  db: QueryDatabase = database(),
) {
  return db.all<{ provider: MetadataSource }>(
    "SELECT DISTINCT provider FROM external_refs WHERE entity_type='variant' AND entity_id=? AND provider IN ('zap','comic_vine') ORDER BY provider DESC",
    [id],
  );
}
export async function lookupMetadata(
  id: number,
  expectedVersion: number,
  source: MetadataSource,
  db: QueryDatabase = database(),
  clients: {
    zap?: IntakeZapClient;
    comicVine?: Pick<ComicVineIntakeClient, 'issueMetadata'>;
  } = {},
): Promise<MetadataSuggestions> {
  const comic = await getEditableMetadata(id, db);
  if (!comic) throw new MetadataLookupError('Comic not found.');
  if (
    !Number.isSafeInteger(expectedVersion) ||
    comic.editVersion !== expectedVersion
  )
    throw new MetadataEditConflict();
  const refs = async (entity: string, entityId: number) =>
    db.all<Reference>(
      'SELECT external_id AS externalId, metadata_json AS metadata FROM external_refs WHERE entity_type=? AND entity_id=? AND provider=?',
      [entity, entityId, source],
    );
  const [coverRefs, seriesRefs] = await Promise.all([
    refs('variant', id),
    refs('series', comic.seriesId),
  ]);
  if (coverRefs.length !== 1 || seriesRefs.length > 1)
    throw new MetadataLookupError(
      'This comic needs one unambiguous provider match before its details can be fetched. Your edits are unchanged.',
    );
  let issue: NormalizedIssueResult;
  let publisher: string | null = null;
  let coverPriceCents: number | null = null;
  if (source === 'zap') {
    if (
      seriesRefs.length !== 1 ||
      !/^\d+$/.test(coverRefs[0].externalId) ||
      !/^\d+$/.test(seriesRefs[0].externalId)
    )
      throw new MetadataLookupError(
        'This comic needs a Zap title and cover match before its details can be fetched.',
      );
    const client = clients.zap ?? intakeZapClient();
    let titleSlug: string | undefined;
    for (const ref of [...seriesRefs, ...coverRefs]) {
      try {
        const metadata = JSON.parse(ref.metadata ?? '{}');
        if (
          typeof metadata?.titleSlug === 'string' &&
          metadata.titleSlug.trim()
        )
          titleSlug = metadata.titleSlug.trim();
      } catch {
        /* Legacy mappings have no saved slug. Resolve using the exact title ID. */
      }
    }
    if (!titleSlug) {
      const aliases = await db.all<{ name: string }>(
        'SELECT name FROM series_aliases WHERE series_id=? ORDER BY rowid DESC LIMIT 4',
        [comic.seriesId],
      );
      const names = [
        ...new Set(
          [comic.seriesName, ...aliases.map((a) => a.name)].flatMap((name) => [
            name,
            name.replace(/\s*\(\d{4}\)\s*$/, ''),
          ]),
        ),
      ];
      for (const name of names) {
        let rows;
        try {
          rows = await client.searchTitles(name, 30);
        } catch {
          throw new MetadataLookupError(
            'Zap title search is unavailable. Open Providers, check the session, then retry. Your edits are unchanged.',
          );
        }
        const matches = rows.filter(
          (row) => String(row.id) === seriesRefs[0].externalId,
        );
        if (matches.length === 1) {
          titleSlug = matches[0].slug;
          break;
        }
      }
    }
    if (!titleSlug)
      throw new MetadataLookupError(
        'Zap could not find the saved title match. Your edits are unchanged.',
      );
    const title = {
      source: 'zap' as const,
      externalId: seriesRefs[0].externalId,
      name: comic.seriesName,
      slug: titleSlug,
      year: null,
      publisher: null,
    };
    const covers = await discoverZapCovers(
      title,
      comic.issueNumber,
      comic.issueType,
      client,
    );
    const cover = covers.find(
      (row) => row.externalId === coverRefs[0].externalId,
    );
    if (!cover)
      throw new MetadataLookupError(
        'Zap did not return this exact cover. Your edits are unchanged.',
      );
    const metadata = await zapCoverMetadata(
      {
        title,
        localSeriesId: comic.seriesId,
        issueNumber: comic.issueNumber,
        issueType: comic.issueType,
        covers,
      },
      cover,
      client,
    );
    issue = metadata.issue;
    publisher = metadata.publisher;
    coverPriceCents = metadata.variant.coverPriceCents;
  } else {
    const client = clients.comicVine ?? new ComicVineIntakeClient();
    issue = await client.issueMetadata(
      coverRefs[0].externalId,
      comic.issueNumber,
      comic.issueType,
      seriesRefs[0]?.externalId,
    );
  }
  // Recheck after a slow provider request. Suggestions cannot silently bypass stale editing protection.
  const latest = await db.get<{ version: number }>(
    'SELECT edit_version AS version FROM variants WHERE id=?',
    [id],
  );
  if (!latest || latest.version !== expectedVersion)
    throw new MetadataEditConflict();
  const credits = issue.creators
    .flatMap((credit) =>
      credit.roles.map((role) => ({
        name: credit.name.trim(),
        role: normalizeRole(role) || null,
      })),
    )
    .filter(
      (credit) =>
        credit.name &&
        (source !== 'comic_vine' || credit.role !== 'cover_artist'),
    );
  const unique = credits.filter(
    (credit, index) =>
      credits.findIndex(
        (other) =>
          other.name.toLocaleLowerCase() === credit.name.toLocaleLowerCase() &&
          other.role === credit.role,
      ) === index,
  );
  if (unique.length > 100)
    throw new MetadataLookupError(
      'The provider returned too many creator credits. Your edits are unchanged.',
    );
  return {
    storyTitle: nonEmptyString(issue.storyTitle)?.slice(0, 1000) ?? null,
    firstAppearanceOf:
      nonEmptyString(issue.firstAppearanceOf)?.slice(0, 1000) ?? null,
    publisherName: nonEmptyString(publisher)?.slice(0, 500) ?? null,
    coverPriceCents,
    details: readableNotes(issue.description)?.slice(0, 20000) ?? null,
    credits: unique.filter(
      (credit) =>
        credit.name.length <= 500 && (credit.role?.length ?? 0) <= 100,
    ),
    notice:
      source === 'comic_vine'
        ? 'Comic Vine provides issue-level credits. Cover artists are left for you to confirm for this exact cover.'
        : 'Zap details were matched to this exact cover.',
  };
}

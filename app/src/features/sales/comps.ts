import {
  createZapSupabaseClient,
  type ZapEbaySoldLookupResponse,
  type ZapIssueListRow,
  zapLiveConfig,
} from '@/providers/zap/live';

import { getSoldCompTarget, saveSoldCompCache } from './repository';

function exactIssue(
  rows: ZapIssueListRow[],
  providerVariantId: string,
): ZapIssueListRow | undefined {
  return rows.find((row) => String(row.id) === providerVariantId);
}

export async function refreshSoldComps(
  holdingId: number,
  forceRefresh = false,
): Promise<ZapEbaySoldLookupResponse> {
  const target = await getSoldCompTarget(holdingId);
  if (!target) throw new Error('This holding has no usable Zap mapping.');

  const client = createZapSupabaseClient(zapLiveConfig());
  const titles = await client.searchTitles(target.seriesName, 15);
  const title = titles.find((row) => String(row.id) === target.zapSeriesId);
  if (!title)
    throw new Error('Zap title lookup did not match the preserved ID.');

  const issues = await client.issuesForTitle({
    titleSlug: title.slug,
    issueNumber: target.issueNumber,
  });
  const issue = exactIssue(issues.issues, target.zapVariantId);
  if (!issue)
    throw new Error('Zap issue lookup did not match the preserved ID.');

  const response = await client.ebaySoldLookup({
    issueId: issue.id,
    titleName: target.seriesName,
    issueNumber: target.issueNumber,
    variant: issue.variant ?? '',
    coverArtist: issue.cover_artist ?? '',
    issueType: issue.issue_type_id === 2 ? 'Annual' : 'Issue',
    publisher: issue.publisher ?? target.publisherName ?? '',
    coverDate: issue.cover_date ?? '',
    currentNmPrice: (target.sourcePriceCents ?? 0) / 100,
    keyIssue: String(issue.key_issue ?? '0'),
    coverPrice: issue.cover_price ?? (target.coverPriceCents ?? 0) / 100,
    forceRefresh,
  });

  if (!response.success)
    throw new Error('Zap sold-comps lookup did not succeed.');

  const fetchedAt = response.fetched_at ?? new Date().toISOString();
  await saveSoldCompCache(
    target.zapVariantId,
    fetchedAt,
    JSON.stringify(response),
  );
  return response;
}

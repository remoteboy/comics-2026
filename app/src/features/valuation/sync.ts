import { database } from '@/db';
import type { MutationDatabase } from '@/db/database';
import {
  createZapSupabaseClient,
  type ZapIssueConditionRow,
  type ZapIssuePriceRow,
  type ZapRecentPriceChangeRow,
  zapLiveConfig,
} from '@/providers/zap/live';

import { valueAtGrade } from './calculate';
import {
  createValuationSyncRun,
  finishValuationSyncRun,
  listZapValuationBackfillTargets,
  listZapValuationTargets,
  recordLiveValuation,
} from './repository';
import type {
  ValuationSyncResult,
  ValuationSyncStats,
  ZapValuationTarget,
} from './types';

const RECENT_PAGE_SIZE = 15;
const RECENT_ROW_CAP = 100;
const BACKFILL_BATCH_SIZE = 50;
const BACKFILL_CONCURRENCY = 6;

export interface ZapValuationClient {
  issueConditions(): Promise<ZapIssueConditionRow[]>;
  latestRawPrice(issueId: string | number): Promise<ZapIssuePriceRow | null>;
  recentPriceChanges(
    pageLimit?: number,
    pageOffset?: number,
  ): Promise<ZapRecentPriceChangeRow[]>;
}

interface SyncOptions {
  db?: MutationDatabase;
  client?: ZapValuationClient;
  now?: Date;
}

interface BackfillOptions extends SyncOptions {
  batchSize?: number;
  concurrency?: number;
}

function groupTargetsByZapId(
  targets: ZapValuationTarget[],
): Map<string, ZapValuationTarget[]> {
  const grouped = new Map<string, ZapValuationTarget[]>();

  for (const target of targets) {
    const group = grouped.get(target.zapVariantId) ?? [];
    group.push(target);
    grouped.set(target.zapVariantId, group);
  }

  return grouped;
}

function emptyStats(mode: 'recent' | 'backfill'): ValuationSyncStats {
  return {
    mode,
    pages: 0,
    providerRequests: 0,
    providerRows: 0,
    ownedRows: 0,
    refreshedHoldings: 0,
    changedHoldings: 0,
    unchangedHoldings: 0,
    skippedHoldings: 0,
  };
}

async function applyRawPrice(
  targets: ZapValuationTarget[],
  nmPriceCents: number,
  observedAt: string,
  refreshedAt: string,
  runId: number,
  conditions: ZapIssueConditionRow[],
  stats: ValuationSyncStats,
  db: MutationDatabase,
): Promise<void> {
  for (const target of targets) {
    const valuation = valueAtGrade(
      nmPriceCents,
      target.gradeTenths,
      conditions,
    );

    if (!valuation) {
      stats.skippedHoldings += 1;
      continue;
    }

    const result = await recordLiveValuation(
      {
        holdingId: target.holdingId,
        providerVariantId: target.zapVariantId,
        gradeTenths: valuation.gradeTenths,
        priceCents: valuation.priceCents,
        sourcePriceCents: nmPriceCents,
        conditionPercentage: valuation.conditionPercentage,
        observedAt,
        refreshedAt,
        syncRunId: runId,
      },
      db,
    );

    stats.refreshedHoldings += 1;
    if (result === 'changed') stats.changedHoldings += 1;
    else stats.unchangedHoldings += 1;
  }
}

export async function syncRecentZapValuations(
  options: SyncOptions = {},
): Promise<ValuationSyncResult> {
  const db = options.db ?? database();
  const client = options.client ?? createZapSupabaseClient(zapLiveConfig());
  const now = options.now ?? new Date();
  const startedAt = now.toISOString();
  const runId = await createValuationSyncRun(startedAt, db);
  const stats = emptyStats('recent');

  try {
    const [conditions, targets] = await Promise.all([
      client.issueConditions(),
      listZapValuationTargets(db),
    ]);
    const targetsByZapId = groupTargetsByZapId(targets);
    let offset = 0;
    let reportedTotal = RECENT_ROW_CAP;

    while (offset < Math.min(reportedTotal, RECENT_ROW_CAP)) {
      const pageLimit = Math.min(RECENT_PAGE_SIZE, RECENT_ROW_CAP - offset);
      const rows = await client.recentPriceChanges(pageLimit, offset);
      stats.pages += 1;
      stats.providerRequests += 1;
      stats.providerRows += rows.length;

      if (!rows.length) break;
      reportedTotal = rows[0]?.total_count ?? reportedTotal;

      for (const row of rows) {
        const owned = targetsByZapId.get(String(row.issue_id));
        if (!owned?.length) continue;

        stats.ownedRows += 1;

        if (row.current_nm_price === null) {
          stats.skippedHoldings += owned.length;
          continue;
        }

        await applyRawPrice(
          owned,
          Math.round(row.current_nm_price * 100),
          row.price_change_date ?? row.issue_updated_at ?? startedAt,
          startedAt,
          runId,
          conditions,
          stats,
          db,
        );
      }

      offset += rows.length;
      if (rows.length < pageLimit) break;
    }

    const status = reportedTotal > RECENT_ROW_CAP ? 'partial' : 'success';
    await finishValuationSyncRun(
      runId,
      status,
      new Date().toISOString(),
      stats,
      null,
      db,
    );

    return { runId, status, stats };
  } catch (error) {
    await finishFailedRun(runId, stats, error, db);
    throw error;
  }
}

export async function refreshZapValuationBackfill(
  options: BackfillOptions = {},
): Promise<ValuationSyncResult> {
  const db = options.db ?? database();
  const client = options.client ?? createZapSupabaseClient(zapLiveConfig());
  const now = options.now ?? new Date();
  const startedAt = now.toISOString();
  const batchSize = options.batchSize ?? BACKFILL_BATCH_SIZE;
  const concurrency = options.concurrency ?? BACKFILL_CONCURRENCY;
  const runId = await createValuationSyncRun(startedAt, db);
  const stats = emptyStats('backfill');

  try {
    const [conditions, targets] = await Promise.all([
      client.issueConditions(),
      listZapValuationBackfillTargets(batchSize, db),
    ]);
    const groups = [...groupTargetsByZapId(targets).entries()];
    let index = 0;

    async function worker(): Promise<void> {
      while (index < groups.length) {
        const current = groups[index++];
        if (!current) return;

        const [zapVariantId, owned] = current;
        const row = await client.latestRawPrice(zapVariantId);
        stats.providerRequests += 1;

        if (!row) {
          stats.skippedHoldings += owned.length;
          continue;
        }

        stats.providerRows += 1;
        stats.ownedRows += 1;
        await applyRawPrice(
          owned,
          Math.round(row.price * 100),
          row.price_guides?.effective_date ?? startedAt,
          startedAt,
          runId,
          conditions,
          stats,
          db,
        );
      }
    }

    await Promise.all(
      Array.from({ length: Math.min(concurrency, groups.length) }, () =>
        worker(),
      ),
    );

    await finishValuationSyncRun(
      runId,
      'success',
      new Date().toISOString(),
      stats,
      null,
      db,
    );

    return { runId, status: 'success', stats };
  } catch (error) {
    await finishFailedRun(runId, stats, error, db);
    throw error;
  }
}

async function finishFailedRun(
  runId: number,
  stats: ValuationSyncStats,
  error: unknown,
  db: MutationDatabase,
): Promise<void> {
  await finishValuationSyncRun(
    runId,
    'failed',
    new Date().toISOString(),
    stats,
    error instanceof Error ? error.message : 'Valuation sync failed.',
    db,
  );
}

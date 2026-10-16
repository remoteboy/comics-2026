import { database } from '@/db';
import type { MutationDatabase } from '@/db/database';
import { createZapSupabaseClient, zapLiveConfig } from '@/providers/zap/live';
import { valueAtGrade } from './calculate';
import {
  createValuationSyncRun,
  finishValuationSyncRun,
  recordLiveValuation,
  recordProviderPriceCheck,
} from './repository';
import { syncRecentZapValuations, type ZapValuationClient } from './sync';
import type { ValuationSyncStats, ZapValuationTarget } from './types';

export interface ScheduledValuationState {
  startedAt: string | null;
  completedAt: string | null;
  status: string;
  errorText: string | null;
}
export async function scheduledValuationState(
  db: MutationDatabase = database(),
) {
  return db.get<ScheduledValuationState>(
    'SELECT started_at AS startedAt,completed_at AS completedAt,status,error_text AS errorText FROM scheduled_valuation_state WHERE id=1',
  );
}
export async function runScheduledValuations(options: {
  scheduledTime: number;
  db?: MutationDatabase;
  client?: Pick<ZapValuationClient, 'issueConditions' | 'latestRawPrice'> &
    Partial<Pick<ZapValuationClient, 'recentPriceChanges'>>;
  now?: () => Date;
}) {
  const db = options.db ?? database();
  const clock = options.now ?? (() => new Date());
  const started = clock();
  if (!Number.isSafeInteger(options.scheduledTime) || options.scheduledTime < 0)
    throw new Error('Invalid scheduled time.');
  const token = crypto.randomUUID();
  const lease = new Date(started.getTime() + 10 * 60 * 1000).toISOString();
  const claimed = await db.run(
    `UPDATE scheduled_valuation_state SET lease_token=?,locked_until=?,scheduled_at=?,started_at=?,completed_at=NULL,status='running',error_text=NULL
    WHERE id=1 AND locked_until<=? AND scheduled_at<?`,
    [
      token,
      lease,
      options.scheduledTime,
      started.toISOString(),
      started.toISOString(),
      options.scheduledTime,
    ],
  );
  if (!claimed.changes) return { status: 'skipped' as const };
  const stats: ValuationSyncStats = {
    mode: 'scheduled',
    pages: 0,
    providerRequests: 0,
    providerRows: 0,
    ownedRows: 0,
    selectedVariants: 0,
    pricedVariants: 0,
    noPriceVariants: 0,
    failedVariants: 0,
    refreshedHoldings: 0,
    changedHoldings: 0,
    unchangedHoldings: 0,
    skippedHoldings: 0,
  };
  let runId: number | undefined;
  const stillOwner = async () => {
    const row = await db.get(
      'SELECT 1 FROM scheduled_valuation_state WHERE id=1 AND lease_token=? AND locked_until>?',
      [token, clock().toISOString()],
    );
    if (!row) throw new Error('Scheduled valuation lease expired.');
  };
  const attempt = async (id: string, status: string) =>
    db.run(
      `INSERT INTO scheduled_valuation_attempts(provider_variant_id,attempted_at,status) VALUES(?,?,?)
    ON CONFLICT(provider_variant_id) DO UPDATE SET attempted_at=excluded.attempted_at,status=excluded.status`,
      [id, clock().toISOString(), status],
    );
  try {
    runId = await createValuationSyncRun(started.toISOString(), db);
    const client =
      options.client ??
      createZapSupabaseClient(zapLiveConfig(), (url, init) =>
        fetch(url, { ...init, signal: AbortSignal.timeout(15000) }),
      );
    const tick = new Date(options.scheduledTime);
    // Nightly recent changes complement the rotating stale-price sweep.
    if (
      tick.getUTCHours() === 22 &&
      tick.getUTCMinutes() === 30 &&
      client.recentPriceChanges
    ) {
      await syncRecentZapValuations({
        db,
        now: started,
        client: {
          issueConditions: () => client.issueConditions(),
          latestRawPrice: (id) => client.latestRawPrice(id),
          recentPriceChanges: (limit, offset) =>
            client.recentPriceChanges!(limit, offset),
        },
      });
      await stillOwner();
    }
    // Recent feed windows do not cover every owned comic. Rotate across stale/missing values instead.
    const cutoff = new Date(started.getTime() - 7 * 86400000).toISOString();
    const retry = new Date(started.getTime() - 6 * 3600000).toISOString();
    const selected = await db.all<{ id: string }>(
      `SELECT er.external_id AS id FROM external_refs er JOIN holdings h ON h.variant_id=er.entity_id
      LEFT JOIN current_valuations cv ON cv.holding_id=h.id
      LEFT JOIN scheduled_valuation_attempts a ON a.provider_variant_id=er.external_id
      WHERE er.entity_type='variant' AND er.provider='zap' AND h.quantity>0
      AND (SELECT COUNT(*) FROM external_refs x WHERE x.entity_type='variant' AND x.entity_id=h.variant_id AND x.provider='zap')=1
      AND (a.attempted_at IS NULL OR a.attempted_at<=?)
      GROUP BY er.external_id HAVING MIN(CASE WHEN cv.provider='zap' AND julianday(cv.refreshed_at)>=julianday(?) THEN 1 ELSE 0 END)=0
      ORDER BY COALESCE(a.attempted_at,'1970-01-01'),MIN(h.id) LIMIT 2`,
      [retry, cutoff],
    );
    stats.selectedVariants = selected.length;
    if (selected.length) {
      const conditions = await client.issueConditions();
      for (const { id } of selected) {
        await stillOwner();
        await attempt(id, 'running');
        // Capture before network access. Subsequent edits, removal or provider corrections win.
        const targets = await db.all<ZapValuationTarget>(
          `SELECT h.id AS holdingId,h.variant_id AS variantId,h.edit_version AS editVersion,h.grade_tenths AS gradeTenths,h.current_value_cents AS currentValueCents,er.external_id AS zapVariantId
          FROM holdings h JOIN external_refs er ON er.entity_type='variant' AND er.entity_id=h.variant_id AND er.provider='zap'
          WHERE h.quantity>0 AND er.external_id=? AND (SELECT COUNT(*) FROM external_refs x WHERE x.entity_type='variant' AND x.entity_id=h.variant_id AND x.provider='zap')=1`,
          [id],
        );
        stats.ownedRows += targets.length;
        try {
          stats.providerRequests++;
          const price = await client.latestRawPrice(id);
          await stillOwner();
          if (!price) {
            stats.noPriceVariants++;
            stats.skippedHoldings += targets.length;
            await recordProviderPriceCheck(
              id,
              'no_price',
              clock().toISOString(),
              null,
              db,
            );
            await attempt(id, 'no_price');
            continue;
          }
          const cents = Math.round(price.price * 100);
          if (
            String(price.issue_id) !== id ||
            typeof price.price !== 'number' ||
            !Number.isSafeInteger(cents) ||
            cents < 0
          )
            throw new Error('Unusable provider price.');
          stats.pricedVariants++;
          stats.providerRows++;
          for (const target of targets) {
            const value = valueAtGrade(cents, target.gradeTenths, conditions);
            if (
              !value ||
              !Number.isSafeInteger(value.priceCents) ||
              value.priceCents < 0
            ) {
              stats.skippedHoldings++;
              continue;
            }
            const result = await recordLiveValuation(
              {
                holdingId: target.holdingId,
                expectedEditVersion: target.editVersion,
                providerVariantId: id,
                gradeTenths: value.gradeTenths,
                priceCents: value.priceCents,
                sourcePriceCents: cents,
                conditionPercentage: value.conditionPercentage,
                observedAt:
                  price.price_guides?.effective_date &&
                  Number.isFinite(Date.parse(price.price_guides.effective_date))
                    ? price.price_guides.effective_date
                    : started.toISOString(),
                refreshedAt: started.toISOString(),
                syncRunId: runId,
              },
              db,
            );
            if (result === 'skipped') stats.skippedHoldings++;
            else {
              stats.refreshedHoldings++;
              if (result === 'changed') stats.changedHoldings++;
              else stats.unchangedHoldings++;
            }
          }
          await recordProviderPriceCheck(
            id,
            'priced',
            clock().toISOString(),
            null,
            db,
          );
          await attempt(id, 'priced');
        } catch {
          await stillOwner();
          stats.failedVariants++;
          stats.skippedHoldings += targets.length;
          await recordProviderPriceCheck(
            id,
            'error',
            clock().toISOString(),
            'Scheduled price lookup failed. Check Providers and retry.',
            db,
          );
          await attempt(id, 'error');
        }
      }
    }
    const status = stats.failedVariants ? 'partial' : 'success';
    await finishValuationSyncRun(
      runId,
      status,
      clock().toISOString(),
      stats,
      null,
      db,
    );
    await db.run(
      'UPDATE scheduled_valuation_state SET status=?,completed_at=?,locked_until=?,lease_token=NULL WHERE id=1 AND lease_token=?',
      [status, clock().toISOString(), clock().toISOString(), token],
    );
    return { status, runId, stats };
  } catch {
    const error =
      'Scheduled refresh failed. Check Providers and the Worker logs; collection data remains available.';
    if (runId !== undefined)
      await finishValuationSyncRun(
        runId,
        'failed',
        clock().toISOString(),
        stats,
        error,
        db,
      );
    await db.run(
      "UPDATE scheduled_valuation_state SET status='failed',error_text=?,completed_at=?,locked_until=?,lease_token=NULL WHERE id=1 AND lease_token=?",
      [error, clock().toISOString(), clock().toISOString(), token],
    );
    return { status: 'failed' as const, runId };
  }
}

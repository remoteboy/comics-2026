import { database } from '@/db';
import type {
  MutationDatabase,
  MutationStatement,
  QueryDatabase,
} from '@/db/database';

import { hasMaterialPriceChange } from './calculate';
import type {
  CurrentValuation,
  PriceSnapshot,
  ValuationBackfillProgress,
  ValuationHealthSummary,
  ValuationMovement,
  ValuationSyncRun,
  ValuationWrite,
  ZapValuationTarget,
} from './types';

export async function listPriceHistory(
  holdingId: number,
  db: QueryDatabase = database(),
): Promise<PriceSnapshot[]> {
  return db.all<PriceSnapshot>(
    `
      SELECT
        id,
        provider,
        grade_tenths AS gradeTenths,
        price_cents AS priceCents,
        observed_at AS observedAt
      FROM price_snapshots
      WHERE holding_id = ?
      ORDER BY observed_at DESC, id DESC
    `,
    [holdingId],
  );
}

export async function getCurrentValuation(
  holdingId: number,
  db: QueryDatabase = database(),
): Promise<CurrentValuation | undefined> {
  return db.get<CurrentValuation>(
    `
      SELECT
        holding_id AS holdingId,
        provider,
        provider_variant_id AS providerVariantId,
        grade_tenths AS gradeTenths,
        price_cents AS priceCents,
        source_price_cents AS sourcePriceCents,
        condition_percentage AS conditionPercentage,
        observed_at AS observedAt,
        refreshed_at AS refreshedAt
      FROM current_valuations
      WHERE holding_id = ?
    `,
    [holdingId],
  );
}

export async function listZapValuationTargets(
  db: QueryDatabase = database(),
): Promise<ZapValuationTarget[]> {
  return db.all<ZapValuationTarget>(`
    SELECT
      h.id AS holdingId,
      h.variant_id AS variantId,
      zap.external_id AS zapVariantId,
      h.grade_tenths AS gradeTenths,
      h.current_value_cents AS currentValueCents
    FROM holdings h
    JOIN external_refs zap
      ON zap.entity_type = 'variant'
     AND zap.entity_id = h.variant_id
     AND zap.provider = 'zap'
    ORDER BY h.id
  `);
}

export async function listZapValuationBackfillTargets(
  limit = 50,
  db: QueryDatabase = database(),
): Promise<ZapValuationTarget[]> {
  return db.all<ZapValuationTarget>(
    `
      WITH pending_variants AS (
        SELECT
          zap.external_id AS zap_variant_id,
          MIN(h.id) AS first_holding_id,
          MIN(CASE WHEN h.current_value_cents IS NULL THEN 0 ELSE 1 END) AS missing_rank,
          MAX(CASE WHEN checks.status = 'error' THEN 1 ELSE 0 END) AS retry_rank
        FROM holdings h
        JOIN external_refs zap
          ON zap.entity_type = 'variant'
         AND zap.entity_id = h.variant_id
         AND zap.provider = 'zap'
        LEFT JOIN current_valuations cv ON cv.holding_id = h.id
        LEFT JOIN provider_price_checks checks
          ON checks.provider = 'zap'
         AND checks.provider_variant_id = zap.external_id
        WHERE (cv.holding_id IS NULL OR cv.provider != 'zap')
          AND (checks.status IS NULL OR checks.status = 'error')
        GROUP BY zap.external_id
        ORDER BY retry_rank, missing_rank, first_holding_id
        LIMIT ?
      )
      SELECT
        h.id AS holdingId,
        h.variant_id AS variantId,
        zap.external_id AS zapVariantId,
        h.grade_tenths AS gradeTenths,
        h.current_value_cents AS currentValueCents
      FROM pending_variants pending
      JOIN external_refs zap
        ON zap.entity_type = 'variant'
       AND zap.provider = 'zap'
       AND zap.external_id = pending.zap_variant_id
      JOIN holdings h ON h.variant_id = zap.entity_id
      ORDER BY pending.first_holding_id, h.id
    `,
    [limit],
  );
}

export async function getValuationBackfillProgress(
  db: QueryDatabase = database(),
): Promise<ValuationBackfillProgress> {
  const row = await db.get<ValuationBackfillProgress>(`
    WITH zap_holdings AS (
      SELECT
        h.id AS holding_id,
        zap.external_id AS zap_variant_id,
        cv.provider AS valuation_provider
      FROM holdings h
      JOIN external_refs zap
        ON zap.entity_type = 'variant'
       AND zap.entity_id = h.variant_id
       AND zap.provider = 'zap'
      LEFT JOIN current_valuations cv ON cv.holding_id = h.id
    ),
    variant_state AS (
      SELECT
        zap_variant_id,
        MAX(
          CASE
            WHEN valuation_provider IS NULL OR valuation_provider != 'zap' THEN 1
            ELSE 0
          END
        ) AS has_legacy
      FROM zap_holdings
      GROUP BY zap_variant_id
    )
    SELECT
      COUNT(*) AS totalZapVariants,
      COALESCE(SUM(CASE
        WHEN checks.status IN ('priced', 'no_price') THEN 1 ELSE 0 END), 0)
        AS checkedVariants,
      COALESCE(SUM(CASE
        WHEN state.has_legacy = 1
         AND (checks.status IS NULL OR checks.status = 'error')
        THEN 1 ELSE 0 END), 0) AS pendingVariants,
      COALESCE(SUM(CASE
        WHEN state.has_legacy = 1 AND checks.status = 'no_price'
        THEN 1 ELSE 0 END), 0) AS noPriceVariants,
      COALESCE(SUM(CASE
        WHEN state.has_legacy = 1 AND checks.status = 'priced'
        THEN 1 ELSE 0 END), 0) AS unresolvedVariants,
      COALESCE(SUM(CASE
        WHEN state.has_legacy = 1 AND checks.status = 'error'
        THEN 1 ELSE 0 END), 0) AS failedVariants,
      (
        SELECT COUNT(*)
        FROM zap_holdings
        WHERE valuation_provider IS NULL OR valuation_provider != 'zap'
      ) AS legacyMappedHoldings,
      (
        SELECT COUNT(*)
        FROM holdings h
        WHERE NOT EXISTS (
          SELECT 1
          FROM external_refs zap
          WHERE zap.entity_type = 'variant'
            AND zap.entity_id = h.variant_id
            AND zap.provider = 'zap'
        )
      ) AS unmappedHoldings
    FROM variant_state state
    LEFT JOIN provider_price_checks checks
      ON checks.provider = 'zap'
     AND checks.provider_variant_id = state.zap_variant_id
  `);

  if (!row) throw new Error('Unable to load valuation backfill progress.');
  return row;
}

export async function recordProviderPriceCheck(
  providerVariantId: string,
  status: 'priced' | 'no_price' | 'error',
  checkedAt: string,
  errorText: string | null,
  db: MutationDatabase = database(),
): Promise<void> {
  await db.run(
    `
      INSERT INTO provider_price_checks(
        provider, provider_variant_id, status, checked_at, error_text
      ) VALUES ('zap', ?, ?, ?, ?)
      ON CONFLICT(provider, provider_variant_id) DO UPDATE SET
        status = excluded.status,
        checked_at = excluded.checked_at,
        error_text = excluded.error_text
    `,
    [providerVariantId, status, checkedAt, errorText],
  );
}

export async function getValuationHealthSummary(
  db: QueryDatabase = database(),
): Promise<ValuationHealthSummary> {
  const row = await db.get<ValuationHealthSummary>(`
    SELECT
      COUNT(*) AS totalHoldings,
      COALESCE(SUM(CASE WHEN cv.provider = 'zap' THEN 1 ELSE 0 END), 0) AS liveHoldings,
      COALESCE(SUM(CASE
        WHEN cv.provider = 'zap' AND cv.refreshed_at >= datetime('now', '-7 days')
        THEN 1 ELSE 0 END), 0) AS freshHoldings,
      COALESCE(SUM(CASE
        WHEN cv.provider = 'zap' AND cv.refreshed_at < datetime('now', '-7 days')
        THEN 1 ELSE 0 END), 0) AS staleLiveHoldings,
      COALESCE(SUM(CASE WHEN cv.provider = 'legacy' THEN 1 ELSE 0 END), 0) AS legacyHoldings,
      COALESCE(SUM(CASE WHEN cv.price_cents IS NULL THEN 1 ELSE 0 END), 0) AS missingHoldings,
      MAX(CASE WHEN cv.provider = 'zap' THEN cv.refreshed_at END) AS latestRefreshAt
    FROM holdings h
    LEFT JOIN current_valuations cv ON cv.holding_id = h.id
  `);

  if (!row) throw new Error('Unable to load valuation health.');
  return row;
}

export async function listValuationMovements(
  limit = 20,
  db: QueryDatabase = database(),
): Promise<ValuationMovement[]> {
  return db.all<ValuationMovement>(
    `
      SELECT
        h.id AS holdingId,
        v.id AS variantId,
        s.name AS seriesName,
        i.number AS issueNumber,
        v.name AS variantName,
        h.grade_tenths AS gradeTenths,
        cv.price_cents AS currentPriceCents,
        (
          SELECT ps.price_cents
          FROM price_snapshots ps
          WHERE ps.holding_id = h.id
            AND ps.observed_at <= datetime('now', '-30 days')
          ORDER BY ps.observed_at DESC, ps.id DESC
          LIMIT 1
        ) AS price30DaysCents,
        (
          SELECT ps.price_cents
          FROM price_snapshots ps
          WHERE ps.holding_id = h.id
            AND ps.observed_at <= datetime('now', '-90 days')
          ORDER BY ps.observed_at DESC, ps.id DESC
          LIMIT 1
        ) AS price90DaysCents,
        (
          SELECT ps.price_cents
          FROM price_snapshots ps
          WHERE ps.holding_id = h.id
          ORDER BY ps.observed_at, ps.id
          LIMIT 1
        ) AS firstPriceCents,
        cv.refreshed_at AS refreshedAt
      FROM current_valuations cv
      JOIN holdings h ON h.id = cv.holding_id
      JOIN variants v ON v.id = h.variant_id
      JOIN issues i ON i.id = v.issue_id
      JOIN series s ON s.id = i.series_id
      WHERE cv.provider = 'zap' AND cv.price_cents IS NOT NULL
      ORDER BY ABS(
        cv.price_cents - COALESCE(
          (
            SELECT ps.price_cents
            FROM price_snapshots ps
            WHERE ps.holding_id = h.id
              AND ps.observed_at <= datetime('now', '-30 days')
            ORDER BY ps.observed_at DESC, ps.id DESC
            LIMIT 1
          ),
          cv.price_cents
        )
      ) DESC,
      cv.refreshed_at DESC
      LIMIT ?
    `,
    [limit],
  );
}

export async function listValuationSyncRuns(
  limit = 10,
  db: QueryDatabase = database(),
): Promise<ValuationSyncRun[]> {
  return db.all<ValuationSyncRun>(
    `
      SELECT
        id,
        provider,
        started_at AS startedAt,
        completed_at AS completedAt,
        status,
        stats_json AS statsJson,
        error_text AS errorText
      FROM sync_runs
      WHERE provider = 'zap'
      ORDER BY started_at DESC, id DESC
      LIMIT ?
    `,
    [limit],
  );
}

export async function createValuationSyncRun(
  startedAt: string,
  db: MutationDatabase = database(),
): Promise<number> {
  const result = await db.run(
    `INSERT INTO sync_runs(provider, started_at, status) VALUES ('zap', ?, 'running')`,
    [startedAt],
  );
  return Number(result.lastInsertRowid);
}

export async function finishValuationSyncRun(
  runId: number,
  status: 'success' | 'failed' | 'partial',
  completedAt: string,
  stats: object | null,
  errorText: string | null,
  db: MutationDatabase = database(),
): Promise<void> {
  await db.run(
    `
      UPDATE sync_runs
      SET completed_at = ?, status = ?, stats_json = ?, error_text = ?
      WHERE id = ?
    `,
    [
      completedAt,
      status,
      stats ? JSON.stringify(stats) : null,
      errorText,
      runId,
    ],
  );
}

export async function recordLiveValuation(
  value: ValuationWrite,
  db: MutationDatabase = database(),
): Promise<'changed' | 'unchanged'> {
  const current = await db.get<{ currentValueCents: number | null }>(
    `SELECT current_value_cents AS currentValueCents FROM holdings WHERE id = ?`,
    [value.holdingId],
  );

  if (!current) throw new Error(`Holding ${value.holdingId} no longer exists.`);

  const changed = hasMaterialPriceChange(
    current.currentValueCents,
    value.priceCents,
  );
  const statements: MutationStatement[] = [];

  if (changed) {
    statements.push({
      sql: `
        INSERT INTO price_snapshots(
          holding_id, provider, grade_tenths, price_cents, observed_at
        ) VALUES (?, 'zap', ?, ?, ?)
      `,
      parameters: [
        value.holdingId,
        value.gradeTenths,
        value.priceCents,
        value.observedAt,
      ],
    });
  }

  statements.push(
    {
      sql: `
        UPDATE holdings
        SET current_value_cents = ?, updated_at = ?
        WHERE id = ?
      `,
      parameters: [value.priceCents, value.refreshedAt, value.holdingId],
    },
    {
      sql: `
        INSERT INTO current_valuations(
          holding_id,
          provider,
          provider_variant_id,
          grade_tenths,
          price_cents,
          source_price_cents,
          condition_percentage,
          observed_at,
          refreshed_at,
          sync_run_id
        ) VALUES (?, 'zap', ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(holding_id) DO UPDATE SET
          provider = excluded.provider,
          provider_variant_id = excluded.provider_variant_id,
          grade_tenths = excluded.grade_tenths,
          price_cents = excluded.price_cents,
          source_price_cents = excluded.source_price_cents,
          condition_percentage = excluded.condition_percentage,
          observed_at = excluded.observed_at,
          refreshed_at = excluded.refreshed_at,
          sync_run_id = excluded.sync_run_id
      `,
      parameters: [
        value.holdingId,
        value.providerVariantId,
        value.gradeTenths,
        value.priceCents,
        value.sourcePriceCents,
        value.conditionPercentage,
        value.observedAt,
        value.refreshedAt,
        value.syncRunId,
      ],
    },
  );

  await db.batch(statements);
  return changed ? 'changed' : 'unchanged';
}

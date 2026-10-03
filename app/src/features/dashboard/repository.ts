import { database } from '@/db';
import type { QueryDatabase } from '@/db/database';

import type {
  DashboardSummary,
  ValuableHolding,
  ValuationChange,
} from './types';

export async function getDashboardSummary(
  db: QueryDatabase = database(),
): Promise<DashboardSummary> {
  const row = await db.get<DashboardSummary>(`
    SELECT
      COALESCE(SUM(COALESCE(current_value_cents, 0) * quantity), 0) AS collectionValueCents,
      COALESCE(SUM(quantity), 0) AS physicalCopies,
      (SELECT COUNT(*) FROM series) AS seriesCount,
      (SELECT COUNT(*) FROM boxes) AS boxCount,
      COALESCE(SUM(CASE WHEN box_id IS NOT NULL THEN quantity ELSE 0 END), 0) AS boxedCopies,
      COALESCE(SUM(CASE WHEN box_id IS NULL THEN quantity ELSE 0 END), 0) AS unboxedCopies,
      COALESCE(SUM(CASE WHEN current_value_cents IS NOT NULL THEN 1 ELSE 0 END), 0) AS valuedHoldings,
      COALESCE(SUM(CASE WHEN current_value_cents IS NULL THEN 1 ELSE 0 END), 0) AS unvaluedHoldings,
      COALESCE(SUM(CASE WHEN current_value_cents = 0 THEN 1 ELSE 0 END), 0) AS zeroValueHoldings,
      COALESCE(SUM(
        CASE
          WHEN current_value_cents IS NOT NULL
            AND COALESCE(updated_at, created_at) < datetime('now', '-365 days')
          THEN 1 ELSE 0
        END
      ), 0) AS staleValuedHoldings,
      (SELECT COUNT(*) FROM price_snapshots) AS priceSnapshotCount,
      (SELECT MAX(observed_at) FROM price_snapshots) AS latestValuationAt
    FROM holdings
  `);

  if (!row) throw new Error('Unable to load dashboard summary.');
  return row;
}

export async function getMostValuableHoldings(
  limit = 8,
  db: QueryDatabase = database(),
): Promise<ValuableHolding[]> {
  return db.all<ValuableHolding>(
    `
      SELECT
        h.id AS holdingId,
        v.id AS variantId,
        s.name AS seriesName,
        i.number AS issueNumber,
        v.name AS variantName,
        h.grade_tenths AS gradeTenths,
        h.current_value_cents AS valueCents,
        h.quantity,
        h.box_id AS boxId,
        v.image_key AS imageKey
      FROM holdings h
      JOIN variants v ON v.id = h.variant_id
      JOIN issues i ON i.id = v.issue_id
      JOIN series s ON s.id = i.series_id
      WHERE h.current_value_cents IS NOT NULL
      ORDER BY (h.current_value_cents * h.quantity) DESC, s.name, i.number
      LIMIT ?
    `,
    [limit],
  );
}

export async function getBiggestRecoveredMovers(
  limit = 10,
  db: QueryDatabase = database(),
): Promise<ValuationChange[]> {
  return db.all<ValuationChange>(
    `
      WITH history AS (
        SELECT
          ps.*,
          LAG(ps.price_cents) OVER (
            PARTITION BY ps.holding_id
            ORDER BY ps.observed_at, ps.id
          ) AS previous_price_cents
        FROM price_snapshots ps
      ),
      changes AS (
        SELECT
          history.*,
          history.price_cents - history.previous_price_cents AS delta_cents,
          CASE
            WHEN history.previous_price_cents IS NULL OR history.previous_price_cents = 0 THEN NULL
            ELSE ((history.price_cents - history.previous_price_cents) * 100.0 / history.previous_price_cents)
          END AS change_percent
        FROM history
        WHERE history.previous_price_cents IS NOT NULL
          AND history.price_cents != history.previous_price_cents
      )
      SELECT
        h.id AS holdingId,
        v.id AS variantId,
        s.name AS seriesName,
        i.number AS issueNumber,
        v.name AS variantName,
        h.grade_tenths AS gradeTenths,
        h.current_value_cents AS valueCents,
        h.quantity,
        h.box_id AS boxId,
        v.image_key AS imageKey,
        changes.observed_at AS observedAt,
        changes.previous_price_cents AS previousPriceCents,
        changes.price_cents AS snapshotPriceCents,
        changes.delta_cents AS deltaCents,
        changes.change_percent AS changePercent
      FROM changes
      JOIN holdings h ON h.id = changes.holding_id
      JOIN variants v ON v.id = h.variant_id
      JOIN issues i ON i.id = v.issue_id
      JOIN series s ON s.id = i.series_id
      ORDER BY ABS(changes.delta_cents) DESC, changes.observed_at DESC
      LIMIT ?
    `,
    [limit],
  );
}

export async function getRecentValuationChanges(
  limit = 8,
  db: QueryDatabase = database(),
): Promise<ValuationChange[]> {
  return db.all<ValuationChange>(
    `
      WITH history AS (
        SELECT
          ps.*,
          LAG(ps.price_cents) OVER (
            PARTITION BY ps.holding_id
            ORDER BY ps.observed_at, ps.id
          ) AS previous_price_cents
        FROM price_snapshots ps
      )
      SELECT
        h.id AS holdingId,
        v.id AS variantId,
        s.name AS seriesName,
        i.number AS issueNumber,
        v.name AS variantName,
        h.grade_tenths AS gradeTenths,
        h.current_value_cents AS valueCents,
        h.quantity,
        h.box_id AS boxId,
        v.image_key AS imageKey,
        history.observed_at AS observedAt,
        history.previous_price_cents AS previousPriceCents,
        history.price_cents AS snapshotPriceCents,
        history.price_cents - history.previous_price_cents AS deltaCents,
        CASE
          WHEN history.previous_price_cents IS NULL OR history.previous_price_cents = 0 THEN NULL
          ELSE ((history.price_cents - history.previous_price_cents) * 100.0 / history.previous_price_cents)
        END AS changePercent
      FROM history
      JOIN holdings h ON h.id = history.holding_id
      JOIN variants v ON v.id = h.variant_id
      JOIN issues i ON i.id = v.issue_id
      JOIN series s ON s.id = i.series_id
      ORDER BY history.observed_at DESC, history.id DESC
      LIMIT ?
    `,
    [limit],
  );
}

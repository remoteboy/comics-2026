import { database } from '@/db';
import type { MutationDatabase, QueryDatabase } from '@/db/database';

import { ebayResearchUrl, evaluateSaleCandidate } from './calculate';
import type {
  SaleCandidate,
  SaleCandidateRow,
  SaleIntelligenceSettings,
  SaleSummary,
  SoldCompCacheRow,
  SoldCompTarget,
} from './types';

export async function getSaleIntelligenceSettings(
  db: QueryDatabase = database(),
): Promise<SaleIntelligenceSettings> {
  const row = await db.get<SaleIntelligenceSettings>(`
    SELECT
      minimum_current_value_cents AS minimumCurrentValueCents,
      minimum_absolute_movement_cents AS minimumAbsoluteMovementCents,
      minimum_percentage_movement AS minimumPercentageMovement
    FROM sale_intelligence_settings
    WHERE id = 1
  `);

  if (!row) throw new Error('Sale intelligence settings are unavailable.');
  return row;
}

export async function updateSaleIntelligenceSettings(
  settings: SaleIntelligenceSettings,
  db: MutationDatabase = database(),
): Promise<void> {
  await db.run(
    `
      UPDATE sale_intelligence_settings
      SET
        minimum_current_value_cents = ?,
        minimum_absolute_movement_cents = ?,
        minimum_percentage_movement = ?,
        updated_at = datetime('now')
      WHERE id = 1
    `,
    [
      settings.minimumCurrentValueCents,
      settings.minimumAbsoluteMovementCents,
      settings.minimumPercentageMovement,
    ],
  );
}

export async function setSaleWatchState(
  holdingId: number,
  watched: boolean,
  notes: string | null,
  db: MutationDatabase = database(),
): Promise<void> {
  await db.run(
    `
      INSERT INTO sale_watch_state(
        holding_id, is_watched, notes, created_at, updated_at
      ) VALUES (?, ?, ?, datetime('now'), datetime('now'))
      ON CONFLICT(holding_id) DO UPDATE SET
        is_watched = excluded.is_watched,
        notes = excluded.notes,
        updated_at = datetime('now')
    `,
    [holdingId, watched ? 1 : 0, notes],
  );
}

async function listSaleCandidateRows(
  db: QueryDatabase = database(),
): Promise<SaleCandidateRow[]> {
  return db.all<SaleCandidateRow>(`
    SELECT
      h.id AS holdingId,
      v.id AS variantId,
      s.name AS seriesName,
      i.number AS issueNumber,
      i.type AS issueType,
      v.name AS variantName,
      h.grade_tenths AS gradeTenths,
      h.quantity,
      v.image_key AS imageKey,
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
      cv.provider AS valuationProvider,
      cv.refreshed_at AS refreshedAt,
      zap.external_id AS providerVariantId,
      COALESCE(watch.is_watched, 0) AS watched,
      watch.notes
    FROM holdings h
    JOIN variants v ON v.id = h.variant_id
    JOIN issues i ON i.id = v.issue_id
    JOIN series s ON s.id = i.series_id
    LEFT JOIN current_valuations cv ON cv.holding_id = h.id
    LEFT JOIN external_refs zap
      ON zap.entity_type = 'variant'
     AND zap.entity_id = v.id
     AND zap.provider = 'zap'
    LEFT JOIN sale_watch_state watch ON watch.holding_id = h.id
    ORDER BY h.id
  `);
}

function enrichCandidate(
  row: SaleCandidateRow,
  settings: SaleIntelligenceSettings,
): SaleCandidate {
  const decision = evaluateSaleCandidate(row, settings);
  const liveDecision =
    row.valuationProvider === 'zap'
      ? decision
      : { ...decision, qualifies: false, reasons: [] };
  return {
    ...row,
    ...liveDecision,
    ebayResearchUrl: ebayResearchUrl(
      row.seriesName,
      row.issueNumber,
      row.variantName,
    ),
  };
}

export async function listSaleCandidates(
  db: QueryDatabase = database(),
): Promise<SaleCandidate[]> {
  const [settings, rows] = await Promise.all([
    getSaleIntelligenceSettings(db),
    listSaleCandidateRows(db),
  ]);

  return rows
    .map((row) => enrichCandidate(row, settings))
    .filter((item) => item.watched === 1 || item.qualifies)
    .sort((left, right) => {
      if (left.watched !== right.watched) return right.watched - left.watched;
      const movement =
        (right.bestAbsoluteMovementCents ?? 0) -
        (left.bestAbsoluteMovementCents ?? 0);
      if (movement !== 0) return movement;
      return (right.currentPriceCents ?? 0) - (left.currentPriceCents ?? 0);
    });
}

export async function getSaleCandidate(
  holdingId: number,
  db: QueryDatabase = database(),
): Promise<SaleCandidate | undefined> {
  const [settings, rows] = await Promise.all([
    getSaleIntelligenceSettings(db),
    listSaleCandidateRows(db),
  ]);
  const row = rows.find((item) => item.holdingId === holdingId);
  return row ? enrichCandidate(row, settings) : undefined;
}

export async function getSaleSummary(
  db: QueryDatabase = database(),
): Promise<SaleSummary> {
  const candidates = await listSaleCandidates(db);
  const automatic = candidates.filter((item) => item.qualifies);
  const watched = candidates.filter((item) => item.watched === 1);

  return {
    automaticCandidates: automatic.length,
    watchedHoldings: watched.length,
    candidateValueCents: automatic.reduce(
      (total, item) => total + (item.currentPriceCents ?? 0) * item.quantity,
      0,
    ),
  };
}

export async function getSoldCompTarget(
  holdingId: number,
  db: QueryDatabase = database(),
): Promise<SoldCompTarget | undefined> {
  return db.get<SoldCompTarget>(
    `
      SELECT
        h.id AS holdingId,
        s.name AS seriesName,
        i.number AS issueNumber,
        i.type AS issueType,
        v.name AS variantName,
        p.name AS publisherName,
        v.cover_price_cents AS coverPriceCents,
        h.grade_tenths AS gradeTenths,
        cv.source_price_cents AS sourcePriceCents,
        zap_series.external_id AS zapSeriesId,
        zap_variant.external_id AS zapVariantId
      FROM holdings h
      JOIN variants v ON v.id = h.variant_id
      JOIN issues i ON i.id = v.issue_id
      JOIN series s ON s.id = i.series_id
      LEFT JOIN publishers p ON p.id = v.publisher_id
      LEFT JOIN current_valuations cv ON cv.holding_id = h.id
      JOIN external_refs zap_variant
        ON zap_variant.entity_type = 'variant'
       AND zap_variant.entity_id = v.id
       AND zap_variant.provider = 'zap'
      JOIN external_refs zap_series
        ON zap_series.entity_type = 'series'
       AND zap_series.entity_id = s.id
       AND zap_series.provider = 'zap'
      WHERE h.id = ?
    `,
    [holdingId],
  );
}

export async function getSoldCompCache(
  providerVariantId: string,
  db: QueryDatabase = database(),
): Promise<SoldCompCacheRow | undefined> {
  return db.get<SoldCompCacheRow>(
    `
      SELECT
        provider_variant_id AS providerVariantId,
        fetched_at AS fetchedAt,
        response_json AS responseJson
      FROM sold_comp_cache
      WHERE provider = 'zap' AND provider_variant_id = ?
    `,
    [providerVariantId],
  );
}

export async function saveSoldCompCache(
  providerVariantId: string,
  fetchedAt: string,
  responseJson: string,
  db: MutationDatabase = database(),
): Promise<void> {
  await db.run(
    `
      INSERT INTO sold_comp_cache(
        provider, provider_variant_id, fetched_at, response_json
      ) VALUES ('zap', ?, ?, ?)
      ON CONFLICT(provider, provider_variant_id) DO UPDATE SET
        fetched_at = excluded.fetched_at,
        response_json = excluded.response_json
    `,
    [providerVariantId, fetchedAt, responseJson],
  );
}

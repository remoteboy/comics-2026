import type { MutationStatement } from '@/db/database';
import type { ValuationWrite } from './types';

/** Shared by scheduled refresh and atomic collection save/fan-out. */
export function liveValuationStatements(
  value: ValuationWrite,
  version: number,
  changed: boolean,
): MutationStatement[] {
  const statements: MutationStatement[] = [
    {
      sql: `UPDATE holdings SET current_value_cents = ?, updated_at = ?, edit_version = edit_version + 1
      WHERE id = ? AND edit_version = ? AND grade_tenths = ? AND quantity > 0
        AND EXISTS (SELECT 1 FROM external_refs er WHERE er.entity_type = 'variant'
          AND er.entity_id = holdings.variant_id AND er.provider = 'zap' AND er.external_id = ?)`,
      parameters: [
        value.priceCents,
        value.refreshedAt,
        value.holdingId,
        version,
        value.gradeTenths,
        value.providerVariantId,
      ],
    },
    {
      // Each statement in a batch shares the previous SQL changes() result.
      // Stale input writes neither the current valuation nor its history.
      sql: `INSERT INTO current_valuations(holding_id, provider, provider_variant_id,
      grade_tenths, price_cents, source_price_cents, condition_percentage,
      observed_at, refreshed_at, sync_run_id)
      SELECT ?, 'zap', ?, ?, ?, ?, ?, ?, ?, ? WHERE changes() = 1
      ON CONFLICT(holding_id) DO UPDATE SET provider = excluded.provider,
        provider_variant_id = excluded.provider_variant_id, grade_tenths = excluded.grade_tenths,
        price_cents = excluded.price_cents, source_price_cents = excluded.source_price_cents,
        condition_percentage = excluded.condition_percentage, observed_at = excluded.observed_at,
        refreshed_at = excluded.refreshed_at, sync_run_id = excluded.sync_run_id`,
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
  ];
  if (changed)
    statements.push({
      sql: `INSERT INTO price_snapshots(holding_id, provider, grade_tenths, price_cents, observed_at, valuation_epoch, variant_id)
      SELECT id, 'zap', ?, ?, ?, valuation_epoch, variant_id FROM holdings WHERE id = ? AND changes() = 1`,
      parameters: [
        value.gradeTenths,
        value.priceCents,
        value.observedAt,
        value.holdingId,
      ],
    });
  return statements;
}

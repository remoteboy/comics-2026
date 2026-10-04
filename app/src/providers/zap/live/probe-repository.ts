import { database } from '@/db';
import type { QueryDatabase } from '@/db/database';

import type { ZapProbeTarget } from './types';

interface ZapProbeRow {
  seriesName: string;
  seriesExternalId: string;
  variantExternalId: string;
  issueNumber: string;
}

export async function getZapProbeTarget(
  db: QueryDatabase = database(),
): Promise<ZapProbeTarget | null> {
  const row = await db.get<ZapProbeRow>(`
    SELECT
      s.name AS seriesName,
      series_ref.external_id AS seriesExternalId,
      variant_ref.external_id AS variantExternalId,
      i.number AS issueNumber
    FROM series s
    JOIN external_refs series_ref
      ON series_ref.entity_type = 'series'
      AND series_ref.entity_id = s.id
      AND series_ref.provider = 'zap'
    JOIN issues i ON i.series_id = s.id
    JOIN variants v ON v.issue_id = i.id
    JOIN external_refs variant_ref
      ON variant_ref.entity_type = 'variant'
      AND variant_ref.entity_id = v.id
      AND variant_ref.provider = 'zap'
    ORDER BY v.id
    LIMIT 1
  `);

  return row ?? null;
}

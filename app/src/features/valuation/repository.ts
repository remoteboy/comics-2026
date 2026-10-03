import { database } from '@/db';
import type { QueryDatabase } from '@/db/database';

import type { PriceSnapshot } from './types';

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

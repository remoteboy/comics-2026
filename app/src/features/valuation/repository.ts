import { database } from '@/db';

import type { PriceSnapshot } from './types';

const db = database();

export async function listPriceHistory(holdingId: number): Promise<PriceSnapshot[]> {
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

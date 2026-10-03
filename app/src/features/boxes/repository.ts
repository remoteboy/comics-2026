import { database } from '@/db';

import type {
  BoxDetail,
  BoxListItem,
  BoxNavigation,
  BoxType,
  HoldingListItemWithSeries,
} from './types';

const db = database();

export async function listBoxes(
  query = '',
  type: BoxType | 'all' = 'all',
): Promise<BoxListItem[]> {
  const clauses: string[] = [];
  const parameters: (string | number)[] = [];
  const trimmed = query.trim();

  if (trimmed) {
    clauses.push(
      "(CAST(b.id AS TEXT) LIKE ? OR COALESCE(b.label, '') LIKE ? COLLATE NOCASE)",
    );
    const search = `%${trimmed}%`;
    parameters.push(search, search);
  }

  if (type !== 'all') {
    clauses.push('b.type = ?');
    parameters.push(type);
  }

  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';

  return db.all<BoxListItem>(
    `
      SELECT
        b.id,
        b.type,
        b.label,
        COUNT(h.id) AS holdingCount,
        COALESCE(SUM(h.quantity), 0) AS copyCount,
        COALESCE(SUM(COALESCE(h.current_value_cents, 0) * h.quantity), 0) AS valueCents
      FROM boxes b
      LEFT JOIN holdings h ON h.box_id = b.id
      ${where}
      GROUP BY b.id
      ORDER BY b.id
    `,
    parameters,
  );
}

export async function getBox(id: number): Promise<BoxDetail | undefined> {
  const box = await db.get<BoxListItem>(
    `
      SELECT
        b.id,
        b.type,
        b.label,
        COUNT(h.id) AS holdingCount,
        COALESCE(SUM(h.quantity), 0) AS copyCount,
        COALESCE(SUM(COALESCE(h.current_value_cents, 0) * h.quantity), 0) AS valueCents
      FROM boxes b
      LEFT JOIN holdings h ON h.box_id = b.id
      WHERE b.id = ?
      GROUP BY b.id
    `,
    [id],
  );

  if (!box) return undefined;

  const holdings = await db.all<HoldingListItemWithSeries>(
    `
      SELECT
        h.id AS holdingId,
        v.id AS variantId,
        s.name AS seriesName,
        i.number AS issueNumber,
        i.type AS issueType,
        v.name AS variantName,
        h.grade_tenths AS gradeTenths,
        h.quantity,
        h.box_id AS boxId,
        h.current_value_cents AS valueCents,
        v.image_key AS imageKey,
        v.first_appearance_of AS firstAppearanceOf
      FROM holdings h
      JOIN variants v ON v.id = h.variant_id
      JOIN issues i ON i.id = v.issue_id
      JOIN series s ON s.id = i.series_id
      WHERE h.box_id = ?
      ORDER BY s.name COLLATE NOCASE,
        CASE WHEN i.number GLOB '[0-9]*' THEN CAST(i.number AS REAL) ELSE 999999 END,
        i.number COLLATE NOCASE,
        v.name COLLATE NOCASE
    `,
    [id],
  );

  return { ...box, holdings };
}

export async function getBoxNavigation(id: number): Promise<BoxNavigation> {
  const row = await db.get<BoxNavigation>(
    `
      SELECT
        (SELECT MAX(id) FROM boxes WHERE id < ?) AS previousId,
        (SELECT MIN(id) FROM boxes WHERE id > ?) AS nextId
    `,
    [id, id],
  );

  return row ?? { previousId: null, nextId: null };
}

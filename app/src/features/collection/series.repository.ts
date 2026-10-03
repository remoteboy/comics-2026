import { database } from '@/db';

import type { HoldingListItem, SeriesDetail, SeriesListResult } from './types';

const db = database();

export async function listSeries(
  query: string,
  page: number,
  perPage = 50,
): Promise<SeriesListResult> {
  const search = `%${query.trim()}%`;
  const where = query.trim() ? 'WHERE s.name LIKE ? OR s.sort_name LIKE ?' : '';
  const parameters = query.trim() ? [search, search] : [];

  const count = await db.get<{ total: number }>(
    `SELECT COUNT(*) AS total FROM series s ${where}`,
    parameters,
  );

  const items = await db.all<SeriesListResult['items'][number]>(
    `
      SELECT
        s.id,
        s.name,
        s.start_year AS startYear,
        s.status,
        COUNT(DISTINCT i.id) AS issueCount,
        COUNT(DISTINCT v.id) AS variantCount,
        COALESCE(SUM(h.quantity), 0) AS copyCount,
        COALESCE(SUM(COALESCE(h.current_value_cents, 0) * h.quantity), 0) AS valueCents
      FROM series s
      LEFT JOIN issues i ON i.series_id = s.id
      LEFT JOIN variants v ON v.issue_id = i.id
      LEFT JOIN holdings h ON h.variant_id = v.id
      ${where}
      GROUP BY s.id
      ORDER BY COALESCE(NULLIF(s.sort_name, ''), s.name) COLLATE NOCASE
      LIMIT ? OFFSET ?
    `,
    [...parameters, perPage, (page - 1) * perPage],
  );

  return { items, total: count?.total ?? 0 };
}

export async function getSeries(id: number): Promise<SeriesDetail | undefined> {
  const row = await db.get<Omit<SeriesDetail, 'publishers'> & { publishers: string | null }>(
    `
      SELECT
        s.id,
        s.name,
        s.start_year AS startYear,
        s.status,
        GROUP_CONCAT(DISTINCT p.name) AS publishers,
        COUNT(DISTINCT CASE WHEN h.id IS NOT NULL THEN v.id END) AS ownedVariants,
        COALESCE(SUM(h.quantity), 0) AS physicalCopies,
        COUNT(DISTINCT h.box_id) AS boxCount,
        COALESCE(SUM(COALESCE(h.current_value_cents, 0) * h.quantity), 0) AS valueCents
      FROM series s
      LEFT JOIN issues i ON i.series_id = s.id
      LEFT JOIN variants v ON v.issue_id = i.id
      LEFT JOIN publishers p ON p.id = v.publisher_id
      LEFT JOIN holdings h ON h.variant_id = v.id
      WHERE s.id = ?
      GROUP BY s.id
    `,
    [id],
  );

  if (!row) return undefined;
  return { ...row, publishers: row.publishers?.split(',').sort() ?? [] };
}

export async function listSeriesHoldings(seriesId: number): Promise<HoldingListItem[]> {
  return db.all<HoldingListItem>(
    `
      SELECT
        h.id AS holdingId,
        v.id AS variantId,
        i.number AS issueNumber,
        i.type AS issueType,
        v.name AS variantName,
        h.grade_tenths AS gradeTenths,
        h.quantity,
        h.box_id AS boxId,
        h.current_value_cents AS valueCents,
        v.image_key AS imageKey,
        v.first_appearance_of AS firstAppearanceOf
      FROM issues i
      JOIN variants v ON v.issue_id = i.id
      JOIN holdings h ON h.variant_id = v.id
      WHERE i.series_id = ?
      ORDER BY
        CASE WHEN i.number GLOB '[0-9]*' THEN CAST(i.number AS REAL) ELSE 999999 END,
        i.number COLLATE NOCASE,
        v.name COLLATE NOCASE,
        h.id
    `,
    [seriesId],
  );
}

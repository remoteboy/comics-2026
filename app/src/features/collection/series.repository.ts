import { database } from '@/db';
import type { QueryDatabase } from '@/db/database';

import { seriesSortSql, seriesWhere } from './series-query';
import type {
  HoldingListItem,
  SeriesDetail,
  SeriesListOptions,
  SeriesListResult,
} from './types';

export async function listSeries(
  options: SeriesListOptions,
  db: QueryDatabase = database(),
): Promise<SeriesListResult> {
  const perPage = options.perPage ?? 40;
  const { sql: where, parameters } = seriesWhere(options);
  const sort = seriesSortSql(options.sort);

  const count = await db.get<{ total: number }>(
    `SELECT COUNT(*) AS total FROM series s ${where}`,
    parameters,
  );

  const rows = await db.all<
    Omit<SeriesListResult['items'][number], 'publishers'> & {
      publishers: string | null;
    }
  >(
    `
      SELECT
        s.id,
        s.name,
        s.start_year AS startYear,
        s.status,
        GROUP_CONCAT(DISTINCT p.name) AS publishers,
        COUNT(DISTINCT i.id) AS issueCount,
        COUNT(DISTINCT v.id) AS variantCount,
        COALESCE(SUM(h.quantity), 0) AS copyCount,
        COALESCE(SUM(COALESCE(h.current_value_cents, 0) * h.quantity), 0) AS valueCents
      FROM series s
      LEFT JOIN issues i ON i.series_id = s.id
      LEFT JOIN variants v ON v.issue_id = i.id
      LEFT JOIN publishers p ON p.id = v.publisher_id
      LEFT JOIN holdings h ON h.variant_id = v.id
      ${where}
      GROUP BY s.id
      ORDER BY ${sort}
      LIMIT ? OFFSET ?
    `,
    [...parameters, perPage, (options.page - 1) * perPage],
  );

  return {
    items: rows.map((row) => ({
      ...row,
      publishers: row.publishers?.split(',').sort() ?? [],
    })),
    total: count?.total ?? 0,
  };
}

export async function getSeries(
  id: number,
  db: QueryDatabase = database(),
): Promise<SeriesDetail | undefined> {
  const row = await db.get<
    Omit<SeriesDetail, 'publishers'> & { publishers: string | null }
  >(
    `
      SELECT
        s.id,
        s.name,
        s.start_year AS startYear,
        s.status,
        GROUP_CONCAT(DISTINCT p.name) AS publishers,
        COUNT(DISTINCT i.id) AS issueCount,
        COUNT(DISTINCT CASE WHEN h.id IS NOT NULL THEN v.id END) AS ownedVariants,
        COALESCE(SUM(h.quantity), 0) AS physicalCopies,
        COUNT(DISTINCT h.box_id) AS boxCount,
        COALESCE(SUM(COALESCE(h.current_value_cents, 0) * h.quantity), 0) AS valueCents,
        COALESCE(SUM(CASE WHEN h.box_id IS NULL THEN h.quantity ELSE 0 END), 0) AS unboxedCopies,
        COALESCE(SUM(CASE WHEN h.id IS NOT NULL AND h.current_value_cents IS NULL THEN 1 ELSE 0 END), 0) AS unvaluedHoldings
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

export async function listSeriesHoldings(
  seriesId: number,
  query = '',
  db: QueryDatabase = database(),
): Promise<HoldingListItem[]> {
  const search = `%${query.trim()}%`;
  const hasQuery = Boolean(query.trim());
  const filter = hasQuery
    ? `AND (
        i.number LIKE ? COLLATE NOCASE
        OR v.name LIKE ? COLLATE NOCASE
        OR COALESCE(v.story_title, '') LIKE ? COLLATE NOCASE
        OR COALESCE(v.first_appearance_of, '') LIKE ? COLLATE NOCASE
        OR EXISTS (
          SELECT 1
          FROM variant_credits vc
          JOIN creators c ON c.id = vc.creator_id
          WHERE vc.variant_id = v.id AND c.name LIKE ? COLLATE NOCASE
        )
      )`
    : '';
  const parameters = hasQuery
    ? [seriesId, search, search, search, search, search]
    : [seriesId];

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
      ${filter}
      ORDER BY
        CASE WHEN i.number GLOB '[0-9]*' THEN CAST(i.number AS REAL) ELSE 999999 END,
        i.number COLLATE NOCASE,
        v.name COLLATE NOCASE,
        h.id
    `,
    parameters,
  );
}

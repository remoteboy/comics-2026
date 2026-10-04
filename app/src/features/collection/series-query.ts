import type {
  SeriesHealthFilter,
  SeriesListOptions,
  SeriesSort,
  SeriesStatus,
} from './types';

const sortSql: Record<SeriesSort, string> = {
  title: "COALESCE(NULLIF(s.sort_name, ''), s.name) COLLATE NOCASE ASC",
  value: 'valueCents DESC, s.name COLLATE NOCASE ASC',
  copies: 'copyCount DESC, s.name COLLATE NOCASE ASC',
  issues: 'issueCount DESC, s.name COLLATE NOCASE ASC',
};

function statusFilter(
  value: SeriesStatus | 'all' | undefined,
): SeriesStatus | 'all' {
  return value === 'ongoing' || value === 'ended' ? value : 'all';
}

function healthFilter(
  value: SeriesHealthFilter | undefined,
): SeriesHealthFilter {
  return ['missing-value', 'zero-value', 'unboxed', 'stale-value'].includes(
    value ?? '',
  )
    ? (value as SeriesHealthFilter)
    : 'all';
}

export function seriesSortSql(sort: SeriesSort | undefined): string {
  return sortSql[sort ?? 'title'] ?? sortSql.title;
}

export function seriesWhere(options: SeriesListOptions): {
  sql: string;
  parameters: (string | number)[];
} {
  const clauses: string[] = [];
  const parameters: (string | number)[] = [];
  const query = options.query.trim();
  const status = statusFilter(options.status);
  const health = healthFilter(options.health);

  if (query) {
    const search = `%${query}%`;
    clauses.push(`(
      s.name LIKE ? COLLATE NOCASE
      OR COALESCE(s.sort_name, '') LIKE ? COLLATE NOCASE
      OR EXISTS (
        SELECT 1
        FROM issues qi
        JOIN variants qv ON qv.issue_id = qi.id
        LEFT JOIN publishers qp ON qp.id = qv.publisher_id
        WHERE qi.series_id = s.id AND qp.name LIKE ? COLLATE NOCASE
      )
      OR EXISTS (
        SELECT 1
        FROM issues qi
        JOIN variants qv ON qv.issue_id = qi.id
        JOIN variant_credits qvc ON qvc.variant_id = qv.id
        JOIN creators qc ON qc.id = qvc.creator_id
        WHERE qi.series_id = s.id AND qc.name LIKE ? COLLATE NOCASE
      )
    )`);
    parameters.push(search, search, search, search);
  }

  if (status !== 'all') {
    clauses.push('s.status = ?');
    parameters.push(status);
  }

  const healthConditions: Record<Exclude<SeriesHealthFilter, 'all'>, string> = {
    'missing-value': 'h.current_value_cents IS NULL',
    'zero-value': 'h.current_value_cents = 0',
    unboxed: 'h.box_id IS NULL',
    'stale-value':
      "h.current_value_cents IS NOT NULL AND NOT EXISTS (SELECT 1 FROM current_valuations cv WHERE cv.holding_id = h.id AND cv.provider = 'zap' AND cv.refreshed_at >= datetime('now', '-7 days'))",
  };

  if (health !== 'all') {
    clauses.push(`EXISTS (
      SELECT 1
      FROM issues hi
      JOIN variants hv ON hv.issue_id = hi.id
      JOIN holdings h ON h.variant_id = hv.id
      WHERE hi.series_id = s.id AND ${healthConditions[health]}
    )`);
  }

  return {
    sql: clauses.length ? `WHERE ${clauses.join(' AND ')}` : '',
    parameters,
  };
}

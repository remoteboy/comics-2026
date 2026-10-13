import { database } from '@/db';
import type { QueryDatabase, QueryParameter } from '@/db/database';
import type { CatalogKind } from './repository';
export interface BrowseFilters {
  title: string;
  role: string;
  owned: boolean;
  seriesId: number | null;
}
export function browseFilters(
  params: URLSearchParams,
  kind: CatalogKind,
): BrowseFilters {
  const id = Number(params.get('series'));
  return {
    title: (params.get('title') ?? '').trim().slice(0, 200),
    role:
      kind === 'creator' ? (params.get('role') ?? '').trim().slice(0, 100) : '',
    owned: params.get('owned') === '1',
    seriesId: Number.isSafeInteger(id) && id > 0 ? id : null,
  };
}
export function browseParams(filters: BrowseFilters) {
  const params = new URLSearchParams();
  if (filters.title) params.set('title', filters.title);
  if (filters.role) params.set('role', filters.role);
  if (filters.owned) params.set('owned', '1');
  if (filters.seriesId) params.set('series', String(filters.seriesId));
  return params;
}
function conditions(kind: CatalogKind, id: number, filters: BrowseFilters) {
  const parameters: QueryParameter[] = [id];
  const clauses = [
    kind === 'creator'
      ? `EXISTS(SELECT 1 FROM variant_credits vc WHERE vc.variant_id=v.id AND vc.creator_id=?${filters.role ? " AND COALESCE(vc.role,'')=?" : ''})`
      : 'v.publisher_id=?',
  ];
  if (kind === 'creator' && filters.role)
    parameters.push(filters.role === '__unspecified' ? '' : filters.role);
  if (filters.owned)
    clauses.push(
      'EXISTS(SELECT 1 FROM holdings h WHERE h.variant_id=v.id AND h.quantity>0)',
    );
  if (filters.seriesId) {
    clauses.push('s.id=?');
    parameters.push(filters.seriesId);
  }
  if (filters.title) {
    clauses.push(
      "(s.name LIKE ? ESCAPE '\\' COLLATE NOCASE OR COALESCE(s.sort_name,'') LIKE ? ESCAPE '\\' COLLATE NOCASE OR EXISTS(SELECT 1 FROM series_aliases sa WHERE sa.series_id=s.id AND sa.name LIKE ? ESCAPE '\\' COLLATE NOCASE))",
    );
    const q = '%' + filters.title.replace(/[\\%_]/g, '\\$&') + '%';
    parameters.push(q, q, q);
  }
  return { where: 'WHERE ' + clauses.join(' AND '), parameters };
}
export interface BrowseSeries {
  id: number;
  name: string;
  year: number | null;
  issueCount: number;
  coverCount: number;
  copyCount: number;
}
export async function browseSeries(
  kind: CatalogKind,
  id: number,
  filters: BrowseFilters,
  page = 1,
  db: QueryDatabase = database(),
) {
  const { where, parameters } = conditions(kind, id, filters);
  const from =
    'FROM variants v JOIN issues i ON i.id=v.issue_id JOIN series s ON s.id=i.series_id';
  const count = await db.get<{ total: number }>(
    `SELECT COUNT(DISTINCT s.id) AS total ${from} ${where}`,
    parameters,
  );
  const items = await db.all<BrowseSeries>(
    `SELECT s.id,s.name,s.start_year AS year,COUNT(DISTINCT i.id) AS issueCount,COUNT(v.id) AS coverCount,COALESCE(SUM((SELECT SUM(h.quantity) FROM holdings h WHERE h.variant_id=v.id)),0) AS copyCount ${from} ${where} GROUP BY s.id ORDER BY COALESCE(NULLIF(s.sort_name,''),s.name) COLLATE NOCASE,s.id LIMIT 20 OFFSET ?`,
    [...parameters, (Math.max(1, page) - 1) * 20],
  );
  return { items, total: count?.total ?? 0 };
}
export async function browseIssues(
  kind: CatalogKind,
  id: number,
  filters: BrowseFilters,
  seriesId: number,
  page = 1,
  db: QueryDatabase = database(),
) {
  const { where, parameters } = conditions(kind, id, { ...filters, seriesId });
  const from =
    'FROM variants v JOIN issues i ON i.id=v.issue_id JOIN series s ON s.id=i.series_id';
  const count = await db.get<{ total: number }>(
    `SELECT COUNT(*) AS total ${from} ${where}`,
    parameters,
  );
  const items = await db.all<{
    id: number;
    title: string;
    number: string;
    type: string;
    cover: string;
    roles: string | null;
    quantity: number;
  }>(
    `SELECT v.id,s.name AS title,i.number,i.type,v.name AS cover,${kind === 'creator' ? "(SELECT GROUP_CONCAT(DISTINCT COALESCE(vc.role,'credit')) FROM variant_credits vc WHERE vc.variant_id=v.id AND vc.creator_id=?)" : 'NULL'} AS roles,COALESCE((SELECT SUM(h.quantity) FROM holdings h WHERE h.variant_id=v.id),0) AS quantity ${from} ${where} ORDER BY (i.type='annual'),CASE WHEN i.number GLOB '[0-9]*' THEN 0 ELSE 1 END,CASE WHEN INSTR(i.number,'/')>0 THEN CAST(SUBSTR(i.number,1,INSTR(i.number,'/')-1) AS REAL)/NULLIF(CAST(SUBSTR(i.number,INSTR(i.number,'/')+1) AS REAL),0) ELSE CAST(i.number AS REAL) END,i.number COLLATE NOCASE,v.name COLLATE NOCASE,v.id LIMIT 40 OFFSET ?`,
    [
      ...(kind === 'creator' ? [id] : []),
      ...parameters,
      (Math.max(1, page) - 1) * 40,
    ],
  );
  return {
    items,
    total: count?.total ?? 0,
    hasMore: page * 40 < (count?.total ?? 0),
  };
}
export async function creatorRoles(id: number, db: QueryDatabase = database()) {
  return db.all<{ role: string }>(
    "SELECT DISTINCT COALESCE(role,'') AS role FROM variant_credits WHERE creator_id=? ORDER BY role",
    [id],
  );
}

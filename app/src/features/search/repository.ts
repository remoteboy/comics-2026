import { database } from '@/db';
import type { QueryDatabase } from '@/db/database';
export async function searchCollectionTitles(
  query: string,
  db: QueryDatabase = database(),
) {
  const q = query.trim().slice(0, 200);
  if (q.length < 2) return [];
  const escaped = q.replace(/[\\%_]/g, '\\$&');
  const rows = await db.all<{ id: number; name: string; year: number | null }>(
    `SELECT id,name,start_year AS year FROM series WHERE name LIKE ? ESCAPE '\\' COLLATE NOCASE OR sort_name LIKE ? ESCAPE '\\' COLLATE NOCASE ORDER BY CASE WHEN name = ? COLLATE NOCASE THEN 0 WHEN name LIKE ? ESCAPE '\\' COLLATE NOCASE THEN 1 ELSE 2 END,name COLLATE NOCASE,id LIMIT 12`,
    ['%' + escaped + '%', '%' + escaped + '%', q, escaped + '%'],
  );
  return rows.map((row) => ({
    label: row.name,
    detail:
      row.year && !row.name.includes(String(row.year))
        ? String(row.year)
        : 'Collection title',
    href: `/collection/${row.id}`,
  }));
}

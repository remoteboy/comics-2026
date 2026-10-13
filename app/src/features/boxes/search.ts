import { database } from '@/db';
import type { QueryDatabase } from '@/db/database';
export async function searchBoxes(
  query: string,
  type = 'all',
  db: QueryDatabase = database(),
) {
  const q = query
    .trim()
    .slice(0, 200)
    .replace(/^box\s+#?\s*(\d+)$/i, '$1');
  if (!q) return [];
  const escaped = q.replace(/[\\%_]/g, '\\$&');
  const valid = ['short', 'long', 'magazine'].includes(type) ? type : 'all';
  const rows = await db.all<{ id: number; label: string | null; type: string }>(
    `SELECT id,label,type FROM boxes WHERE (CAST(id AS TEXT) LIKE ? ESCAPE '\\' OR COALESCE(label,'') LIKE ? ESCAPE '\\' COLLATE NOCASE) ${valid === 'all' ? '' : 'AND type=?'} ORDER BY CASE WHEN CAST(id AS TEXT)=? THEN 0 ELSE 1 END,id LIMIT 12`,
    [
      '%' + escaped + '%',
      '%' + escaped + '%',
      ...(valid === 'all' ? [] : [valid]),
      q,
    ],
  );
  return rows.map((row) => ({
    label: `Box ${row.id}${row.label ? ' · ' + row.label : ''}`,
    detail: row.type[0].toUpperCase() + row.type.slice(1) + ' box',
    href: `/boxes/${row.id}`,
  }));
}

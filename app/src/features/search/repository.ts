import { listCatalog, type CatalogKind } from '@/features/catalog/repository';
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

export async function searchCatalogRecords(
  kind: CatalogKind,
  query: string,
  db: QueryDatabase = database(),
) {
  if (query.trim().length < 2) return [];
  const { items } = await listCatalog(kind, query, 1, db);
  const path = kind === 'creator' ? '/creators' : '/publishers';
  return items.slice(0, 12).map((item) => ({
    label: item.name,
    detail: `${kind === 'creator' ? 'Creator' : 'Publisher'} · ${item.comicCount} covers`,
    href: `${path}/${item.id}`,
  }));
}
export async function searchCollection(
  query: string,
  db: QueryDatabase = database(),
) {
  const q = query.trim().toLocaleLowerCase();
  if (q.length < 2) return [];
  const [titles, creators, publishers] = await Promise.all([
    searchCollectionTitles(query, db),
    searchCatalogRecords('creator', query, db),
    searchCatalogRecords('publisher', query, db),
  ]);
  const rank = (name: string) =>
    name.toLocaleLowerCase() === q
      ? 0
      : name.toLocaleLowerCase().startsWith(q)
        ? 1
        : 2;
  return [
    ...titles.map((title) => ({ ...title, detail: 'Title · ' + title.detail })),
    ...creators,
    ...publishers,
  ]
    .sort(
      (a, b) => rank(a.label) - rank(b.label) || a.label.localeCompare(b.label),
    )
    .slice(0, 12);
}

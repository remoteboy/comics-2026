import { database } from '@/db';
import type {
  MutationDatabase,
  MutationStatement,
  QueryDatabase,
} from '@/db/database';
import { validRequestId } from '@/features/collection/write-form';
export type CatalogKind = 'creator' | 'publisher';
export const catalogConfig = (kind: CatalogKind) =>
  kind === 'creator'
    ? {
        table: 'creators',
        aliases: 'creator_aliases',
        owner: 'creator_id',
        path: '/creators',
        label: 'Creator',
      }
    : {
        table: 'publishers',
        aliases: 'publisher_aliases',
        owner: 'publisher_id',
        path: '/publishers',
        label: 'Publisher',
      };
export function catalogIdentitySql(kind: CatalogKind) {
  const { table, aliases, owner } = catalogConfig(kind);
  return `SELECT id FROM (SELECT id,name,1 AS priority FROM ${table} UNION ALL SELECT ${owner} AS id,name,0 AS priority FROM ${aliases}) WHERE name=? COLLATE NOCASE ORDER BY priority,id LIMIT 1`;
}
export interface CatalogRecord {
  id: number;
  name: string;
  editVersion: number;
  comicCount: number;
  copyCount: number;
}
const literal = (query: string) => query.replace(/[\\%_]/g, '\\$&');
export async function listCatalog(
  kind: CatalogKind,
  query = '',
  page = 1,
  db: QueryDatabase = database(),
) {
  const { table, aliases, owner } = catalogConfig(kind);
  const q = query.trim().slice(0, 200);
  const where = `WHERE lower(trim(e.name)) NOT IN ('','null') AND (e.name LIKE ? ESCAPE '\\' COLLATE NOCASE OR EXISTS(SELECT 1 FROM ${aliases} a WHERE a.${owner}=e.id AND a.name LIKE ? ESCAPE '\\' COLLATE NOCASE))`;
  const parameters = ['%' + literal(q) + '%', '%' + literal(q) + '%'];
  const join =
    kind === 'creator'
      ? 'JOIN variant_credits vc ON vc.variant_id=v.id WHERE vc.creator_id=e.id'
      : 'WHERE v.publisher_id=e.id';
  const count = await db.get<{ total: number }>(
    `SELECT COUNT(*) AS total FROM ${table} e ${where}`,
    parameters,
  );
  const items = await db.all<CatalogRecord>(
    `SELECT e.id,e.name,e.edit_version AS editVersion,(SELECT COUNT(DISTINCT v.id) FROM variants v ${join}) AS comicCount,(SELECT COALESCE(SUM(h.quantity),0) FROM holdings h WHERE h.variant_id IN (SELECT v.id FROM variants v ${join})) AS copyCount FROM ${table} e ${where} ORDER BY CASE WHEN e.name=? COLLATE NOCASE OR EXISTS(SELECT 1 FROM ${aliases} a WHERE a.${owner}=e.id AND a.name=? COLLATE NOCASE) THEN 0 WHEN e.name LIKE ? ESCAPE '\\' COLLATE NOCASE THEN 1 ELSE 2 END,e.name COLLATE NOCASE,e.id LIMIT 40 OFFSET ?`,
    [...parameters, q, q, literal(q) + '%', (Math.max(1, page) - 1) * 40],
  );
  return { items, total: count?.total ?? 0 };
}
export async function getCatalogRecord(
  kind: CatalogKind,
  id: number,
  db: QueryDatabase = database(),
) {
  const { table } = catalogConfig(kind);
  const join =
    kind === 'creator'
      ? 'JOIN variant_credits vc ON vc.variant_id=v.id WHERE vc.creator_id=e.id'
      : 'WHERE v.publisher_id=e.id';
  return db.get<CatalogRecord>(
    `SELECT e.id,e.name,e.edit_version AS editVersion,(SELECT COUNT(DISTINCT v.id) FROM variants v ${join}) AS comicCount,(SELECT COALESCE(SUM(h.quantity),0) FROM holdings h WHERE h.variant_id IN (SELECT v.id FROM variants v ${join})) AS copyCount FROM ${table} e WHERE e.id=?`,
    [id],
  );
}
export async function catalogRedirect(
  kind: CatalogKind,
  id: number,
  db: QueryDatabase = database(),
) {
  return (
    await db.get<{ id: number }>(
      'SELECT new_id AS id FROM catalog_redirects WHERE kind=? AND old_id=?',
      [kind, id],
    )
  )?.id;
}
export async function catalogAliases(
  kind: CatalogKind,
  id: number,
  db: QueryDatabase = database(),
) {
  const { aliases, owner } = catalogConfig(kind);
  return db.all<{ name: string }>(
    `SELECT name FROM ${aliases} WHERE ${owner}=? ORDER BY name COLLATE NOCASE`,
    [id],
  );
}
export async function catalogComics(
  kind: CatalogKind,
  id: number,
  page = 1,
  db: QueryDatabase = database(),
) {
  const condition =
    kind === 'creator'
      ? 'EXISTS(SELECT 1 FROM variant_credits vc WHERE vc.variant_id=v.id AND vc.creator_id=?)'
      : 'v.publisher_id=?';
  const total = await db.get<{ total: number }>(
    `SELECT COUNT(*) AS total FROM variants v WHERE ${condition}`,
    [id],
  );
  const items = await db.all<{
    id: number;
    seriesId: number;
    title: string;
    number: string;
    type: string;
    cover: string;
    roles: string | null;
    quantity: number;
  }>(
    `SELECT v.id,s.id AS seriesId,s.name AS title,i.number,i.type,v.name AS cover,${kind === 'creator' ? "(SELECT GROUP_CONCAT(DISTINCT COALESCE(vc.role,'credit')) FROM variant_credits vc WHERE vc.variant_id=v.id AND vc.creator_id=?)" : 'NULL'} AS roles,(SELECT COALESCE(SUM(quantity),0) FROM holdings WHERE variant_id=v.id) AS quantity FROM variants v JOIN issues i ON i.id=v.issue_id JOIN series s ON s.id=i.series_id WHERE ${condition} ORDER BY COALESCE(s.sort_name,s.name) COLLATE NOCASE,i.number COLLATE NOCASE,v.name COLLATE NOCASE,v.id LIMIT 40 OFFSET ?`,
    [...(kind === 'creator' ? [id] : []), id, (Math.max(1, page) - 1) * 40],
  );
  return { items, total: total?.total ?? 0 };
}
export interface CatalogChange {
  requestId: string;
  kind: CatalogKind;
  id: number;
  version: number;
  action: 'rename' | 'merge';
  name?: string;
  targetId?: number;
  targetVersion?: number;
  confirmed?: boolean;
}
export async function changeCatalog(
  input: CatalogChange,
  db: MutationDatabase = database(),
) {
  validRequestId(input.requestId);
  if (
    !['creator', 'publisher'].includes(input.kind) ||
    !Number.isSafeInteger(input.id) ||
    input.id < 1 ||
    !Number.isSafeInteger(input.version) ||
    input.version < 0 ||
    !['rename', 'merge'].includes(input.action)
  )
    throw new Error('Invalid catalogue edit.');
  const data = { ...input, name: input.name?.trim().replace(/\s+/g, ' ') };
  const inputJson = JSON.stringify(data);
  const previous = await db.get<{ input: string }>(
    'SELECT input_json AS input FROM catalog_changes WHERE request_id=?',
    [input.requestId],
  );
  if (previous) {
    if (previous.input !== inputJson)
      throw new Error(
        'This save request was already used. Reload before saving.',
      );
    return input.action === 'merge' ? input.targetId! : input.id;
  }
  const source = await getCatalogRecord(input.kind, input.id, db);
  if (!source || source.editVersion !== input.version)
    throw new Error(
      'This record changed. Reload its latest details before saving.',
    );
  const { table, aliases, owner } = catalogConfig(input.kind);
  let target: CatalogRecord | undefined;
  if (input.action === 'merge') {
    if (!input.confirmed)
      throw new Error(
        'Confirm that both records describe the same ' + input.kind + '.',
      );
    if (
      !Number.isSafeInteger(input.targetId) ||
      input.targetId! < 1 ||
      input.targetId === input.id
    )
      throw new Error('Choose a different record to keep.');
    target = await getCatalogRecord(input.kind, input.targetId!, db);
    if (!target || target.editVersion !== input.targetVersion)
      throw new Error('The record to keep changed. Reload before merging.');
  } else if (
    !data.name ||
    data.name.length > 500 ||
    data.name.toLowerCase() === 'null'
  )
    throw new Error('Enter a name of 1–500 characters.');
  const name = input.action === 'merge' ? source.name : data.name!;
  const identities = target
    ? `SELECT ${owner} AS id,name FROM ${aliases}`
    : `SELECT id,name FROM ${table} UNION ALL SELECT ${owner} AS id,name FROM ${aliases}`;
  const clashes = await db.all<{ id: number }>(
    `SELECT DISTINCT id FROM (${identities}) WHERE name=? COLLATE NOCASE AND id NOT IN (?,?)`,
    [name, input.id, target?.id ?? input.id],
  );
  if (clashes.length)
    throw new Error(
      'That name belongs to another record. Use Merge duplicates instead.',
    );
  const now = new Date().toISOString();
  const statements: MutationStatement[] = [
    {
      sql: `INSERT INTO catalog_changes(request_id,input_json,before_json,source_guard,target_guard,name_guard,created_at) VALUES(?,?,?,(SELECT 1 FROM ${table} WHERE id=? AND edit_version=?),${target ? `(SELECT 1 FROM ${table} WHERE id=? AND edit_version=?)` : '1'},(SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM (${identities}) WHERE name=? COLLATE NOCASE AND id NOT IN (?,?)) THEN 1 END),?)`,
      parameters: [
        input.requestId,
        inputJson,
        JSON.stringify({ source, target: target ?? null }),
        input.id,
        input.version,
        ...(target ? [target.id, target.editVersion] : []),
        name,
        input.id,
        target?.id ?? input.id,
        now,
      ],
    },
  ];
  const affected =
    input.kind === 'creator'
      ? 'id IN (SELECT variant_id FROM variant_credits WHERE creator_id IN (?,?))'
      : 'publisher_id IN (?,?)';
  statements.push({
    sql: `UPDATE variants SET edit_version=edit_version+1,updated_at=? WHERE ${affected}`,
    parameters: [now, input.id, target?.id ?? input.id],
  });
  if (target) {
    if (input.kind === 'creator')
      statements.push(
        {
          sql: 'UPDATE variant_credits SET creator_id=?,updated_at=? WHERE creator_id=?',
          parameters: [target.id, now, input.id],
        },
        {
          sql: "DELETE FROM variant_credits WHERE creator_id=? AND id NOT IN (SELECT MIN(id) FROM variant_credits WHERE creator_id=? GROUP BY variant_id,COALESCE(role,''))",
          parameters: [target.id, target.id],
        },
      );
    else
      statements.push({
        sql: 'UPDATE variants SET publisher_id=? WHERE publisher_id=?',
        parameters: [target.id, input.id],
      });
    statements.push(
      {
        sql: `UPDATE ${aliases} SET ${owner}=? WHERE ${owner}=?`,
        parameters: [target.id, input.id],
      },
      {
        sql: `INSERT INTO ${aliases}(name,${owner}) VALUES(?,?) ON CONFLICT(name) DO UPDATE SET ${owner}=excluded.${owner}`,
        parameters: [source.name, target.id],
      },
      {
        sql: `UPDATE ${table} SET edit_version=edit_version+1,updated_at=? WHERE id=?`,
        parameters: [now, target.id],
      },
      {
        sql: 'UPDATE catalog_redirects SET new_id=? WHERE kind=? AND new_id=?',
        parameters: [target.id, input.kind, input.id],
      },
      {
        sql: 'INSERT INTO catalog_redirects(kind,old_id,new_id) VALUES(?,?,?)',
        parameters: [input.kind, input.id, target.id],
      },
      { sql: `DELETE FROM ${table} WHERE id=?`, parameters: [input.id] },
    );
  } else {
    statements.push({
      sql: `UPDATE ${table} SET name=?,edit_version=edit_version+1,updated_at=? WHERE id=?`,
      parameters: [data.name!, now, input.id],
    });
    if (source.name.toLowerCase() !== data.name!.toLowerCase())
      statements.push({
        sql: `INSERT INTO ${aliases}(name,${owner}) VALUES(?,?) ON CONFLICT(name) DO UPDATE SET ${owner}=excluded.${owner}`,
        parameters: [source.name, input.id],
      });
  }
  try {
    await db.batch(statements);
  } catch {
    const replay = await db.get<{ input: string }>(
      'SELECT input_json AS input FROM catalog_changes WHERE request_id=?',
      [input.requestId],
    );
    if (replay?.input === inputJson) return target?.id ?? input.id;
    throw new Error(
      'The catalogue changed while you were editing. Reload before saving.',
    );
  }
  return target?.id ?? input.id;
}

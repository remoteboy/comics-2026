import { database } from '@/db';
import type {
  MutationDatabase,
  MutationStatement,
  QueryDatabase,
} from '@/db/database';
import { validRequestId } from '@/features/collection/write-form';
export async function editableSeries(
  id: number,
  db: QueryDatabase = database(),
) {
  return db.get<{
    id: number;
    name: string;
    sortName: string | null;
    year: number | null;
    status: string;
    version: number;
  }>(
    'SELECT id,name,sort_name AS sortName,start_year AS year,status,edit_version AS version FROM series WHERE id=?',
    [id],
  );
}
export async function editableBox(id: number, db: QueryDatabase = database()) {
  return db.get<{
    id: number;
    label: string | null;
    type: string;
    version: number;
    entries: number;
    copies: number;
  }>(
    'SELECT b.id,b.label,b.type,b.edit_version AS version,(SELECT COUNT(*) FROM holdings h WHERE h.box_id=b.id AND h.quantity>0) AS entries,(SELECT COALESCE(SUM(quantity),0) FROM holdings h WHERE h.box_id=b.id) AS copies FROM boxes b WHERE b.id=?',
    [id],
  );
}
export interface SeriesEdit {
  requestId: string;
  id: number;
  version: number;
  name: string;
  sortName: string | null;
  year: number | null;
  status: 'ongoing' | 'ended';
}
async function replay(requestId: string, json: string, db: QueryDatabase) {
  const row = await db.get<{ id: number; input: string }>(
    'SELECT entity_id AS id,input_json AS input FROM administration_changes WHERE request_id=?',
    [requestId],
  );
  if (row && row.input !== json)
    throw new Error(
      'This save request was already used. Reload before saving.',
    );
  return row?.id;
}
export async function saveSeries(
  input: SeriesEdit,
  db: MutationDatabase = database(),
) {
  validRequestId(input.requestId);
  const data = {
    ...input,
    name: input.name.trim(),
    sortName: input.sortName?.trim() || null,
  };
  if (
    !Number.isSafeInteger(input.id) ||
    input.id < 1 ||
    !Number.isSafeInteger(input.version) ||
    input.version < 0 ||
    !data.name ||
    data.name.length > 500 ||
    (data.sortName?.length ?? 0) > 500 ||
    !['ongoing', 'ended'].includes(input.status) ||
    (input.year !== null &&
      (!Number.isSafeInteger(input.year) ||
        input.year < 1800 ||
        input.year > 2999))
  )
    throw new Error('Enter a valid series name, year and status.');
  const json = JSON.stringify(data);
  const existing = await replay(input.requestId, json, db);
  if (existing !== undefined) return existing;
  const before = await editableSeries(input.id, db);
  if (!before || before.version !== input.version)
    throw new Error(
      'This series changed. Reload its latest details before saving.',
    );
  let name = data.name;
  let sortName = data.sortName;
  if (
    name === before.name &&
    before.year !== input.year &&
    before.year !== null &&
    name.endsWith(`(${before.year})`)
  ) {
    name = name
      .replace(/\s*\(\d{4}\)$/, input.year !== null ? ` (${input.year})` : '')
      .trim();
    if (sortName === before.sortName && before.sortName === before.name)
      sortName = name;
  }
  const identityChanged = name !== before.name || input.year !== before.year;
  const clash =
    'SELECT 1 FROM (SELECT id,name,start_year FROM series UNION ALL SELECT series_id AS id,name,start_year FROM series_aliases) WHERE id<>? AND name=? COLLATE NOCASE AND start_year IS ?';
  if (identityChanged && (await db.get(clash, [input.id, name, input.year])))
    throw new Error(
      'Another series already uses that name and year. Open the correct series instead.',
    );
  const now = new Date().toISOString();
  const statements: MutationStatement[] = [
    {
      sql: `INSERT INTO administration_changes(request_id,entity_type,entity_id,input_json,before_json,version_guard,content_guard,created_at) VALUES(?,'series',?,?,?,(SELECT 1 FROM series WHERE id=? AND edit_version=?),${identityChanged ? `(SELECT CASE WHEN NOT EXISTS(${clash}) THEN 1 END)` : '1'},?)`,
      parameters: [
        input.requestId,
        input.id,
        json,
        JSON.stringify(before),
        input.id,
        input.version,
        ...(identityChanged ? [input.id, name, input.year] : []),
        now,
      ],
    },
    {
      sql: 'UPDATE series SET name=?,sort_name=?,start_year=?,status=?,edit_version=edit_version+1,updated_at=? WHERE id=?',
      parameters: [name, sortName, input.year, input.status, now, input.id],
    },
  ];
  if (identityChanged)
    statements.push(
      {
        sql: 'INSERT OR IGNORE INTO series_aliases(series_id,name,start_year) VALUES(?,?,?)',
        parameters: [input.id, before.name, before.year],
      },
      {
        sql: 'UPDATE variants SET edit_version=edit_version+1,updated_at=? WHERE issue_id IN(SELECT id FROM issues WHERE series_id=?)',
        parameters: [now, input.id],
      },
    );
  try {
    await db.batch(statements);
  } catch {
    const again = await replay(input.requestId, json, db);
    if (again !== undefined) return again;
    throw new Error(
      'The series changed while you were editing. Reload before saving.',
    );
  }
  return input.id;
}
export interface BoxEdit {
  requestId: string;
  id: number | null;
  version: number;
  action: 'create' | 'edit' | 'delete';
  number?: number | null;
  label: string | null;
  type: string;
  confirmed?: boolean;
}
export async function saveBox(
  input: BoxEdit,
  db: MutationDatabase = database(),
) {
  validRequestId(input.requestId);
  const data = { ...input, label: input.label?.trim() || null };
  if (
    !['create', 'edit', 'delete'].includes(input.action) ||
    !['short', 'long', 'magazine'].includes(input.type) ||
    (data.label?.length ?? 0) > 500 ||
    !Number.isSafeInteger(input.version) ||
    input.version < 0
  )
    throw new Error('Choose a valid box type and label.');
  if (
    input.action !== 'create' &&
    (!Number.isSafeInteger(input.id) || input.id! < 1)
  )
    throw new Error('Choose an existing box.');
  if (
    input.number !== undefined &&
    input.number !== null &&
    (!Number.isSafeInteger(input.number) || input.number < 1)
  )
    throw new Error(
      'Enter a positive box number or leave it blank for the next number.',
    );
  if (input.action === 'delete' && !input.confirmed)
    throw new Error('Confirm removal of the empty box.');
  const json = JSON.stringify(data);
  const old = await replay(input.requestId, json, db);
  if (old !== undefined) return old;
  const before =
    input.action === 'create' ? null : await editableBox(input.id!, db);
  if (
    input.action !== 'create' &&
    (!before || before.version !== input.version)
  )
    throw new Error(
      'This box changed. Reload its latest details before saving.',
    );
  if (input.action === 'delete' && before!.entries)
    throw new Error(
      'Move all collection entries out of this box before removing it.',
    );
  const now = new Date().toISOString();
  const numberGuard = input.number
    ? "(SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM boxes WHERE id=? UNION ALL SELECT 1 FROM administration_changes WHERE entity_type='box' AND entity_id=?) THEN 1 END)"
    : '1';
  const statements: MutationStatement[] = [
    {
      sql: `INSERT INTO administration_changes(request_id,entity_type,entity_id,input_json,before_json,version_guard,content_guard,created_at) VALUES(?,'box',?,?,?,${before ? '(SELECT 1 FROM boxes WHERE id=? AND edit_version=?)' : '1'},${input.action === 'delete' ? '(SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM holdings WHERE box_id=? AND quantity>0) THEN 1 END)' : input.action === 'create' ? numberGuard : '1'},?)`,
      parameters: [
        input.requestId,
        input.id ?? 0,
        json,
        JSON.stringify(before),
        ...(before ? [input.id!, input.version] : []),
        ...(input.action === 'delete'
          ? [input.id!]
          : input.action === 'create' && input.number
            ? [input.number, input.number]
            : []),
        now,
      ],
    },
  ];
  if (input.action === 'create')
    statements.push(
      {
        sql: `INSERT INTO boxes(id,type,label,created_at,updated_at,creation_request_id) VALUES(${input.number ? '?' : "(SELECT COALESCE(MAX(id),0)+1 FROM (SELECT id FROM boxes UNION ALL SELECT entity_id AS id FROM administration_changes WHERE entity_type='box'))"},?,?,?,?,?)`,
        parameters: [
          ...(input.number ? [input.number] : []),
          input.type,
          data.label,
          now,
          now,
          input.requestId,
        ],
      },
      {
        sql: 'UPDATE administration_changes SET entity_id=(SELECT id FROM boxes WHERE creation_request_id=?) WHERE request_id=?',
        parameters: [input.requestId, input.requestId],
      },
    );
  else if (input.action === 'edit')
    statements.push({
      sql: 'UPDATE boxes SET label=?,type=?,edit_version=edit_version+1,updated_at=? WHERE id=?',
      parameters: [data.label, input.type, now, input.id!],
    });
  else
    statements.push(
      {
        sql: 'UPDATE holdings SET box_id=NULL,edit_version=edit_version+1,updated_at=? WHERE box_id=? AND quantity=0',
        parameters: [now, input.id!],
      },
      {
        sql: 'DELETE FROM boxes WHERE id=?',
        parameters: [input.id!],
      },
    );
  try {
    await db.batch(statements);
  } catch {
    const again = await replay(input.requestId, json, db);
    if (again !== undefined) return again;
    throw new Error(
      input.action === 'create'
        ? 'That box number is already used or retired. Choose another number.'
        : 'This box changed or gained collection entries. Reload before saving.',
    );
  }
  return (await replay(input.requestId, json, db))!;
}

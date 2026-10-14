import { database } from '@/db';
import type { MutationDatabase, QueryDatabase } from '@/db/database';
import { CopyEditConflict, getEditableCopy } from './copy-edit';
import { validRequestId } from './write-form';
export interface ArchiveInput {
  requestId: string;
  holdingId: number;
  expectedVersion: number;
  action: 'archive' | 'restore';
  confirmed: boolean;
}
export async function copyArchive(id: number, db: QueryDatabase = database()) {
  return db.get<{ requestId: string; quantity: number; createdAt: string }>(
    'SELECT request_id AS requestId,quantity,created_at AS createdAt FROM copy_archives WHERE holding_id=? AND restored_at IS NULL ORDER BY created_at DESC,rowid DESC LIMIT 1',
    [id],
  );
}
export async function listSeriesRemovedCopies(
  seriesId: number,
  db: QueryDatabase = database(),
) {
  return db.all<{
    holdingId: number;
    variantId: number;
    number: string;
    type: string;
    cover: string;
    quantity: number;
    purchaseDate: string | null;
    purchasePriceCents: number | null;
  }>(
    `SELECT h.id AS holdingId,v.id AS variantId,i.number,i.type,v.name AS cover,a.quantity,h.purchase_date AS purchaseDate,h.purchase_price_cents AS purchasePriceCents
    FROM copy_archives a JOIN holdings h ON h.id=a.holding_id JOIN variants v ON v.id=h.variant_id JOIN issues i ON i.id=v.issue_id
    WHERE i.series_id=? AND h.quantity=0 AND a.restored_at IS NULL ORDER BY a.created_at DESC,a.rowid DESC`,
    [seriesId],
  );
}
export async function changeCopyArchive(
  input: ArchiveInput,
  db: MutationDatabase = database(),
) {
  validRequestId(input.requestId);
  if (
    !Number.isSafeInteger(input.holdingId) ||
    input.holdingId < 1 ||
    !Number.isSafeInteger(input.expectedVersion) ||
    input.expectedVersion < 0 ||
    !['archive', 'restore'].includes(input.action) ||
    !input.confirmed
  )
    throw new Error('Confirm which copies to remove or restore.');
  const replay = async () => {
    if (input.action === 'archive') {
      const old = await db.get<{ id: number; version: number }>(
        'SELECT holding_id AS id,expected_version AS version FROM copy_archives WHERE request_id=?',
        [input.requestId],
      );
      if (
        old &&
        (old.id !== input.holdingId || old.version !== input.expectedVersion)
      )
        throw new Error(
          'This request was already used. Reload before trying again.',
        );
      return !!old;
    }
    const old = await db.get<{ json: string }>(
      'SELECT input_json AS json FROM copy_archive_restores WHERE request_id=?',
      [input.requestId],
    );
    if (old && old.json !== JSON.stringify(input))
      throw new Error(
        'This request was already used. Reload before trying again.',
      );
    return !!old;
  };
  if (await replay()) return;
  const copy = await getEditableCopy(input.holdingId, db);
  if (
    !copy ||
    copy.editVersion !== input.expectedVersion ||
    (input.action === 'archive' ? copy.quantity < 1 : copy.quantity !== 0)
  )
    throw new CopyEditConflict();
  const now = new Date().toISOString();
  try {
    if (input.action === 'archive') {
      await db.batch([
        {
          sql: 'INSERT INTO copy_archives(request_id,holding_id,expected_version,quantity,before_json,created_at) VALUES(?,?,(SELECT edit_version FROM holdings WHERE id=? AND edit_version=? AND quantity>0),?,?,?)',
          parameters: [
            input.requestId,
            copy.id,
            copy.id,
            input.expectedVersion,
            copy.quantity,
            JSON.stringify(copy),
            now,
          ],
        },
        {
          sql: 'UPDATE holdings SET quantity=0,edit_version=edit_version+1,updated_at=? WHERE id=?',
          parameters: [now, copy.id],
        },
      ]);
    } else {
      const archive = await copyArchive(copy.id, db);
      if (!archive)
        throw new Error('No removed copies are available to restore.');
      await db.batch([
        {
          sql: 'INSERT INTO copy_archive_restores(request_id,archive_id,expected_version,input_json,created_at) VALUES(?,?,(SELECT edit_version FROM holdings WHERE id=? AND edit_version=? AND quantity=0 AND EXISTS(SELECT 1 FROM copy_archives WHERE request_id=? AND restored_at IS NULL)),?,?)',
          parameters: [
            input.requestId,
            archive.requestId,
            copy.id,
            input.expectedVersion,
            archive.requestId,
            JSON.stringify(input),
            now,
          ],
        },
        {
          sql: 'UPDATE holdings SET quantity=?,edit_version=edit_version+1,updated_at=? WHERE id=?',
          parameters: [archive.quantity, now, copy.id],
        },
        {
          sql: 'UPDATE copy_archives SET restored_at=? WHERE request_id=?',
          parameters: [now, archive.requestId],
        },
      ]);
    }
  } catch (cause) {
    if (await replay()) return;
    const latest = await getEditableCopy(input.holdingId, db);
    if (!latest || latest.editVersion !== input.expectedVersion)
      throw new CopyEditConflict();
    throw cause;
  }
}

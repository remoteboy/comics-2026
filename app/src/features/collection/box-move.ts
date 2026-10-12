import { database } from '@/db';
import type { MutationDatabase, MutationStatement } from '@/db/database';
import { CopyEditConflict, getEditableCopy } from './copy-edit';
import { validRequestId } from './write-form';

export interface BoxMoveInput {
  requestId: string;
  copies: { id: number; version: number }[];
  boxId: number | null;
}
export async function moveCopies(
  input: BoxMoveInput,
  db: MutationDatabase = database(),
): Promise<void> {
  validRequestId(input.requestId);
  if (
    !Array.isArray(input.copies) ||
    !input.copies.length ||
    input.copies.length > 200 ||
    input.copies.some(
      (copy) =>
        !copy ||
        !Number.isSafeInteger(copy.id) ||
        copy.id < 1 ||
        !Number.isSafeInteger(copy.version) ||
        copy.version < 0,
    ) ||
    new Set(input.copies.map((copy) => copy.id)).size !== input.copies.length
  )
    throw new Error('Choose valid copies to move.');
  if (
    input.boxId !== null &&
    (!Number.isSafeInteger(input.boxId) || input.boxId < 1)
  )
    throw new Error('Choose a valid box.');
  const inputJson = JSON.stringify(input);
  const replay = async () => {
    const previous = await db.get<{ inputJson: string }>(
      'SELECT input_json AS inputJson FROM copy_box_moves WHERE request_id = ?',
      [input.requestId],
    );
    if (!previous) return false;
    if (previous.inputJson !== inputJson)
      throw new Error(
        'This save request was already used. Reload and try again.',
      );
    return true;
  };
  if (await replay()) return;
  if (
    input.boxId !== null &&
    !(await db.get('SELECT id FROM boxes WHERE id = ?', [input.boxId]))
  )
    throw new Error('That box no longer exists.');
  const copies = await Promise.all(
    input.copies.map((copy) => getEditableCopy(copy.id, db)),
  );
  if (
    copies.some(
      (copy, index) =>
        !copy ||
        copy.editVersion !== input.copies[index].version ||
        copy.quantity < 1,
    )
  )
    throw new CopyEditConflict();
  const first = copies[0]!;
  if (
    copies.some(
      (copy) =>
        copy!.variantId !== first.variantId ||
        copy!.gradeTenths !== first.gradeTenths ||
        copy!.boxId !== first.boxId,
    )
  )
    throw new Error(
      'These copies no longer share a group. Reload and try again.',
    );
  const now = new Date().toISOString();
  const statements: MutationStatement[] = [
    {
      sql: 'INSERT INTO copy_box_moves(request_id, input_json, before_json, created_at) VALUES (?, ?, ?, ?)',
      parameters: [input.requestId, inputJson, JSON.stringify(copies), now],
    },
    ...input.copies.map((copy) => ({
      sql: 'INSERT INTO copy_box_move_items(request_id, holding_id, expected_version) VALUES (?, ?, (SELECT edit_version FROM holdings WHERE id = ? AND edit_version = ? AND quantity > 0))',
      parameters: [input.requestId, copy.id, copy.id, copy.version],
    })),
    ...input.copies.map((copy) => ({
      sql: 'UPDATE holdings SET box_id = ?, edit_version = edit_version + 1, updated_at = ? WHERE id = ?',
      parameters: [input.boxId, now, copy.id],
    })),
  ];
  try {
    await db.batch(statements);
  } catch (cause) {
    if (await replay()) return;
    const latest = await Promise.all(
      input.copies.map((copy) => getEditableCopy(copy.id, db)),
    );
    if (
      latest.some(
        (copy, index) =>
          !copy || copy.editVersion !== input.copies[index].version,
      )
    )
      throw new CopyEditConflict();
    throw cause;
  }
}

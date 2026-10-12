import { database } from '@/db';
import { parsePurchaseDate } from './purchase-details';
import type {
  MutationDatabase,
  MutationStatement,
  QueryDatabase,
} from '@/db/database';

import {
  fetchCopyValuation,
  zapCoverId,
  type CopyValuation,
  type CopyValuationClient,
} from './copy-valuation';
import { liveValuationStatements } from '@/features/valuation/write';

export interface EditableCopy {
  id: number;
  variantId: number;
  issueId: number;
  seriesName: string;
  issueNumber: string;
  issueType: string;
  gradeTenths: number | null;
  quantity: number;
  boxId: number | null;
  valueCents: number | null;
  purchasePriceCents: number | null;
  purchaseDate: string | null;
  editVersion: number;
  valuationEpoch: number;
  createdAt: string;
}

export interface CopyEditInput {
  requestId: string;
  holdingId: number;
  expectedVersion: number;
  scope: 'all' | 'one' | 'add';
  variantId: number;
  gradeTenths: number | null;
  quantity: number;
  boxId: number | null;
  purchasePriceCents: number | null;
  purchaseDate: string | null;
  valueMode: 'keep' | 'zap' | 'unknown' | 'manual';
  manualValueCents: number | null;
}

export class CopyEditConflict extends Error {
  constructor() {
    super(
      'This copy changed while you were editing. Reload its latest details before saving.',
    );
  }
}

export async function getEditableCopy(
  id: number,
  db: QueryDatabase = database(),
) {
  return db.get<EditableCopy>(
    `
    SELECT h.id, h.variant_id AS variantId, v.issue_id AS issueId,
      s.name AS seriesName, i.number AS issueNumber, i.type AS issueType,
      h.grade_tenths AS gradeTenths, h.quantity, h.box_id AS boxId,
      h.current_value_cents AS valueCents, h.purchase_price_cents AS purchasePriceCents, h.purchase_date AS purchaseDate,
      h.edit_version AS editVersion, h.valuation_epoch AS valuationEpoch, h.created_at AS createdAt
    FROM holdings h JOIN variants v ON v.id = h.variant_id
    JOIN issues i ON i.id = v.issue_id JOIN series s ON s.id = i.series_id
    WHERE h.id = ?`,
    [id],
  );
}

export async function listIssueCovers(
  issueId: number,
  db: QueryDatabase = database(),
) {
  return db.all<{ id: number; name: string; imageKey: string | null }>(
    'SELECT id, name, image_key AS imageKey FROM variants WHERE issue_id = ? ORDER BY name COLLATE NOCASE, id',
    [issueId],
  );
}

function integer(value: number, minimum: number, label: string) {
  if (!Number.isSafeInteger(value) || value < minimum)
    throw new Error(`${label} is invalid.`);
}

function money(value: number | null, label: string) {
  if (value !== null) integer(value, 0, label);
}

function validate(input: CopyEditInput) {
  if (!/^[a-zA-Z0-9-]{16,80}$/.test(input.requestId))
    throw new Error('Invalid save request.');
  integer(input.holdingId, 1, 'Copy');
  integer(input.variantId, 1, 'Cover');
  integer(input.expectedVersion, 0, 'Edit version');
  integer(input.quantity, 1, 'Quantity');
  if (!['all', 'one', 'add'].includes(input.scope))
    throw new Error('Choose which copies to change.');
  if (input.scope === 'one' && input.quantity !== 1)
    throw new Error('Editing one copy requires quantity 1.');
  if (input.gradeTenths !== null) {
    integer(input.gradeTenths, 1, 'Grade');
    if (input.gradeTenths > 100)
      throw new Error('Grade must be between 0.1 and 10.0.');
  }
  if (input.boxId !== null) integer(input.boxId, 1, 'Box');
  money(input.purchasePriceCents, 'Purchase price');
  parsePurchaseDate(input.purchaseDate);
  money(input.manualValueCents, 'Current value');
  if (!['keep', 'zap', 'unknown', 'manual'].includes(input.valueMode))
    throw new Error('Choose a value setting.');
  if (input.valueMode === 'manual' && input.manualValueCents === null)
    throw new Error('Enter the current value per copy.');
  if (input.scope === 'add' && input.valueMode === 'keep')
    throw new Error('Choose a value for the new copy, or leave it unknown.');
}

/** Provider pricing is requested before the atomic collection write. */
export async function saveCopyEdit(
  input: CopyEditInput,
  db: MutationDatabase = database(),
  valuationClient?: CopyValuationClient,
) {
  validate(input);
  const inputJson = JSON.stringify(input);
  const previous = await db.get<{ inputJson: string; resultId: number }>(
    'SELECT input_json AS inputJson, result_holding_id AS resultId FROM collection_edits WHERE request_id = ?',
    [input.requestId],
  );
  if (previous) {
    if (previous.inputJson !== inputJson)
      throw new Error(
        'This save request has already been used. Reload before saving different details.',
      );
    return previous.resultId;
  }
  const source = await getEditableCopy(input.holdingId, db);
  if (!source) throw new Error('This copy no longer exists.');
  if (source.editVersion !== input.expectedVersion)
    throw new CopyEditConflict();
  const cover = await db.get<{ id: number }>(
    'SELECT id FROM variants WHERE id = ? AND issue_id = ?',
    [input.variantId, source.issueId],
  );
  if (!cover) throw new Error('Choose a cover for this issue.');
  if (
    input.boxId !== null &&
    !(await db.get('SELECT id FROM boxes WHERE id = ?', [input.boxId]))
  )
    throw new Error('Choose an existing box or Unboxed.');

  const split = input.scope === 'one' && source.quantity > 1;
  const create = split || input.scope === 'add';
  const identityChanged =
    source.variantId !== input.variantId ||
    source.gradeTenths !== input.gradeTenths;
  const reset =
    create ||
    identityChanged ||
    input.valueMode === 'unknown' ||
    input.valueMode === 'manual';
  const needsQuote =
    input.valueMode === 'zap' ||
    (input.valueMode === 'keep' &&
      (identityChanged ||
        input.scope === 'add' ||
        input.quantity > source.quantity));
  let quote: CopyValuation | undefined;
  let peers: Array<{
    id: number;
    editVersion: number;
    valueCents: number | null;
  }> = [];
  if (needsQuote) {
    const providerId = await zapCoverId(input.variantId, db);
    // Capture revisions before the provider call so later edits win.
    peers = await db.all(
      `SELECT h.id, h.edit_version AS editVersion, h.current_value_cents AS valueCents
      FROM holdings h WHERE h.quantity > 0 AND h.grade_tenths = ?
      AND EXISTS (SELECT 1 FROM external_refs er WHERE er.entity_type = 'variant' AND er.entity_id = h.variant_id
        AND er.provider = 'zap' AND er.external_id = ?)
      AND (SELECT COUNT(DISTINCT external_id) FROM external_refs WHERE entity_type = 'variant'
        AND entity_id = h.variant_id AND provider = 'zap') = 1`,
      [input.gradeTenths, providerId],
    );
    quote = await fetchCopyValuation(
      providerId,
      input.gradeTenths,
      valuationClient,
    );
  }
  const preserveSplitValue =
    split && !identityChanged && input.valueMode === 'keep' && !quote;
  const price = quote
    ? quote.priceCents
    : input.valueMode === 'manual'
      ? input.manualValueCents
      : reset && !preserveSplitValue
        ? null
        : source.valueCents;
  const epoch = create ? 0 : source.valuationEpoch + (reset ? 1 : 0);
  const now = new Date().toISOString();
  const resultSql = create
    ? '(SELECT id FROM holdings WHERE creation_request_id = ?)'
    : '?';
  const resultParameter = create ? input.requestId : source.id;

  const statements: MutationStatement[] = [
    {
      // NOT NULL is an atomic compare-and-swap guard. A stale save aborts the
      // whole SQLite/D1 batch, including splits and their audit record.
      sql: `INSERT INTO collection_edits(request_id, source_holding_id, expected_version, input_json, before_json, created_at)
      VALUES (?, ?, (SELECT h.edit_version FROM holdings h JOIN variants v ON v.id = h.variant_id
        WHERE h.id = ? AND h.edit_version = ? AND v.issue_id =
          (SELECT issue_id FROM variants WHERE id = ?)), ?, ?, ?)`,
      parameters: [
        input.requestId,
        source.id,
        source.id,
        input.expectedVersion,
        input.variantId,
        inputJson,
        JSON.stringify(source),
        now,
      ],
    },
  ];

  if (create) {
    statements.push({
      sql: `INSERT INTO holdings(variant_id, grade_tenths, quantity, box_id, current_value_cents,
        purchase_price_cents, purchase_date, created_at, updated_at, creation_request_id)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      parameters: [
        input.variantId,
        input.gradeTenths,
        input.quantity,
        input.boxId,
        price,
        input.purchasePriceCents,
        input.purchaseDate,
        now,
        now,
        input.requestId,
      ],
    });
    if (split)
      statements.push({
        sql: 'UPDATE holdings SET quantity = quantity - 1, edit_version = edit_version + 1, updated_at = ? WHERE id = ?',
        parameters: [now, source.id],
      });
  } else
    statements.push({
      sql: `UPDATE holdings SET variant_id = ?, grade_tenths = ?, quantity = ?, box_id = ?,
      current_value_cents = ?, purchase_price_cents = ?, purchase_date = ?, valuation_epoch = ?,
      edit_version = edit_version + 1, updated_at = ? WHERE id = ?`,
      parameters: [
        input.variantId,
        input.gradeTenths,
        input.quantity,
        input.boxId,
        price,
        input.purchasePriceCents,
        input.purchaseDate,
        epoch,
        now,
        source.id,
      ],
    });

  if (quote)
    statements.push({
      sql: `INSERT INTO current_valuations(holding_id, provider, provider_variant_id, grade_tenths,
      price_cents, source_price_cents, condition_percentage, observed_at, refreshed_at, sync_run_id)
      VALUES (${resultSql}, 'zap', ?, ?, ?, ?, ?, ?, ?, NULL)
      ON CONFLICT(holding_id) DO UPDATE SET provider = 'zap', provider_variant_id = excluded.provider_variant_id,
        grade_tenths = excluded.grade_tenths, price_cents = excluded.price_cents,
        source_price_cents = excluded.source_price_cents, condition_percentage = excluded.condition_percentage,
        observed_at = excluded.observed_at, refreshed_at = excluded.refreshed_at, sync_run_id = NULL`,
      parameters: [
        resultParameter,
        quote.providerVariantId,
        quote.gradeTenths,
        quote.priceCents,
        quote.sourcePriceCents,
        quote.conditionPercentage,
        quote.observedAt,
        quote.refreshedAt,
      ],
    });
  else if (preserveSplitValue)
    statements.push({
      sql: `INSERT INTO current_valuations(holding_id, provider, provider_variant_id, grade_tenths,
      price_cents, source_price_cents, condition_percentage, observed_at, refreshed_at, sync_run_id)
      SELECT ${resultSql}, provider, provider_variant_id, grade_tenths, price_cents,
        source_price_cents, condition_percentage, observed_at, refreshed_at, sync_run_id
      FROM current_valuations WHERE holding_id = ?`,
      parameters: [resultParameter, source.id],
    });
  else if (reset)
    statements.push({
      sql: `INSERT INTO current_valuations(holding_id, provider, grade_tenths, price_cents, refreshed_at)
      VALUES (${resultSql}, ?, ?, ?, ?)
      ON CONFLICT(holding_id) DO UPDATE SET provider = excluded.provider,
        provider_variant_id = NULL, grade_tenths = excluded.grade_tenths,
        price_cents = excluded.price_cents, source_price_cents = NULL,
        condition_percentage = NULL, observed_at = NULL,
        refreshed_at = excluded.refreshed_at, sync_run_id = NULL`,
      parameters: [
        resultParameter,
        input.valueMode === 'manual' ? 'manual' : 'pending',
        input.gradeTenths,
        price,
        now,
      ],
    });
  if ((reset || (quote && source.valueCents !== price)) && price !== null)
    statements.push({
      sql: `INSERT INTO price_snapshots(holding_id, provider, grade_tenths, price_cents, observed_at, valuation_epoch, variant_id)
      VALUES (${resultSql}, ?, ?, ?, ?, ?, ?)`,
      parameters: [
        resultParameter,
        quote ? 'zap' : preserveSplitValue ? 'copy' : 'manual',
        input.gradeTenths,
        price,
        quote?.observedAt ?? now,
        epoch,
        input.variantId,
      ],
    });
  if (quote)
    for (const peer of peers) {
      if (!create && peer.id === source.id) continue;
      statements.push(
        ...liveValuationStatements(
          { ...quote, holdingId: peer.id, syncRunId: null },
          peer.editVersion + (split && peer.id === source.id ? 1 : 0),
          peer.valueCents !== quote.priceCents,
        ),
      );
    }
  statements.push({
    sql: `UPDATE collection_edits SET result_holding_id = ${resultSql} WHERE request_id = ?`,
    parameters: [resultParameter, input.requestId],
  });
  try {
    await db.batch(statements);
  } catch (error) {
    // An identical request may have committed while this one was waiting.
    const replay = await db.get<{ inputJson: string; resultId: number }>(
      'SELECT input_json AS inputJson, result_holding_id AS resultId FROM collection_edits WHERE request_id = ?',
      [input.requestId],
    );
    if (replay?.inputJson === inputJson) return replay.resultId;
    const latest = await getEditableCopy(source.id, db);
    if (!latest || latest.editVersion !== input.expectedVersion)
      throw new CopyEditConflict();
    throw error;
  }
  const saved = await db.get<{ resultId: number }>(
    'SELECT result_holding_id AS resultId FROM collection_edits WHERE request_id = ?',
    [input.requestId],
  );
  if (!saved) throw new Error('Unable to load the saved copy.');
  return saved.resultId;
}

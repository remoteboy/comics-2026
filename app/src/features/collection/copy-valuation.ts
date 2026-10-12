import type { QueryDatabase } from '@/db/database';
import { database } from '@/db';
import { valueAtGrade } from '@/features/valuation/calculate';
import {
  createZapSupabaseClient,
  zapLiveConfig,
  type ZapIssueConditionRow,
  type ZapIssuePriceRow,
} from '@/providers/zap/live';

export interface CopyValuationClient {
  issueConditions(): Promise<ZapIssueConditionRow[]>;
  latestRawPrice(issueId: string): Promise<ZapIssuePriceRow | null>;
}

export interface CopyValuation {
  providerVariantId: string;
  gradeTenths: number;
  priceCents: number;
  sourcePriceCents: number;
  conditionPercentage: number;
  observedAt: string;
  refreshedAt: string;
}

export class CopyValuationUnavailable extends Error {}

export async function zapCoverId(
  variantId: number,
  db: QueryDatabase = database(),
): Promise<string> {
  const refs = await db.all<{ id: string }>(
    `SELECT DISTINCT external_id AS id FROM external_refs
    WHERE entity_type = 'variant' AND entity_id = ? AND provider = 'zap'`,
    [variantId],
  );
  if (refs.length !== 1)
    throw new CopyValuationUnavailable(
      refs.length === 0
        ? 'This cover has no Zap match. Enter a manual value or explicitly save without a value.'
        : 'This cover has conflicting Zap matches. Correct its mapping or enter a manual value.',
    );
  return refs[0].id;
}

export async function fetchCopyValuation(
  providerVariantId: string,
  gradeTenths: number | null,
  client?: CopyValuationClient,
): Promise<CopyValuation> {
  if (gradeTenths === null)
    throw new CopyValuationUnavailable(
      'Enter a grade to get its Zap value, or choose a manual value.',
    );
  if (!client) {
    const config = zapLiveConfig();
    if (!config.publishableKey || !(config.accessToken || config.refreshToken))
      throw new CopyValuationUnavailable(
        'Zap is not configured. Check Providers, enter a manual value, or explicitly save without a value.',
      );
    client = createZapSupabaseClient(config);
  }
  let row: ZapIssuePriceRow | null;
  let conditions: ZapIssueConditionRow[];
  try {
    [row, conditions] = await Promise.all([
      client.latestRawPrice(providerVariantId),
      client.issueConditions(),
    ]);
  } catch {
    throw new CopyValuationUnavailable(
      'Zap could not provide a value. Your collection has not changed. Retry, enter a manual value, or explicitly save without a value.',
    );
  }
  if (!row)
    throw new CopyValuationUnavailable(
      'Zap has no price for this cover. Enter a manual value or explicitly save without a value.',
    );
  const sourcePriceCents = Math.round(row.price * 100);
  if (
    typeof row.price !== 'number' ||
    !Number.isFinite(row.price) ||
    String(row.issue_id) !== providerVariantId ||
    !Number.isSafeInteger(sourcePriceCents) ||
    sourcePriceCents < 0
  )
    throw new CopyValuationUnavailable(
      'Zap returned an unusable price for this cover. Your collection has not changed.',
    );
  const valuation = valueAtGrade(sourcePriceCents, gradeTenths, conditions);
  if (
    !valuation ||
    !Number.isSafeInteger(valuation.priceCents) ||
    valuation.priceCents < 0
  )
    throw new CopyValuationUnavailable(
      `Zap does not provide a value for grade ${(gradeTenths / 10).toFixed(1)}. Choose a supported grade or enter a manual value.`,
    );
  const now = new Date().toISOString();
  const observed = row.price_guides?.effective_date;
  return {
    ...valuation,
    providerVariantId,
    sourcePriceCents,
    observedAt:
      observed && Number.isFinite(Date.parse(observed)) ? observed : now,
    refreshedAt: now,
  };
}

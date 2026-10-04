import type { NormalizedValuationResult } from '../../types';
import {
  asArray,
  asRecord,
  gradeToTenths,
  moneyToCents,
  nonEmptyString,
} from '../../utils';

function firstRecord(payload: unknown): Record<string, unknown> | null {
  const direct = asRecord(payload);
  if (direct) return direct;

  const [first] = asArray(payload);
  return asRecord(first);
}

export function normalizeCurrentZapRawValuations(
  payload: unknown,
): NormalizedValuationResult[] {
  const issue = firstRecord(payload);
  if (!issue) return [];

  const variantExternalId = nonEmptyString(issue.id);
  const priceCents = moneyToCents(issue.current_nm_price);
  if (!variantExternalId || priceCents === null) return [];

  return [
    {
      provider: 'zap',
      variantExternalId,
      gradeTenths: 94,
      priceCents,
      currency: 'USD',
      conditionLabel: 'Near Mint',
    },
  ];
}

export function normalizeCurrentZapGradedValuations(
  payload: unknown,
  variantExternalId: string,
): NormalizedValuationResult[] {
  return asArray(payload).flatMap((value) => {
    const row = asRecord(value);
    if (!row) return [];

    const gradeTenths = gradeToTenths(row.grade);
    const priceCents = moneyToCents(row.price);
    if (gradeTenths === null || priceCents === null) return [];

    return [
      {
        provider: 'zap' as const,
        variantExternalId,
        gradeTenths,
        priceCents,
        currency: 'USD' as const,
        conditionLabel: null,
      },
    ];
  });
}

import type { NormalizedValuationResult } from '../types';
import {
  asNumber,
  asRecord,
  gradeToTenths,
  moneyToCents,
  nonEmptyString,
} from '../utils';
import { zapIssuePayload } from './payload';

export function normalizeZapValuations(
  payload: unknown,
): NormalizedValuationResult[] {
  const parsed = zapIssuePayload(payload);
  if (!parsed) return [];

  const variantExternalId =
    nonEmptyString(parsed.issue.id) ?? nonEmptyString(parsed.wrapper.remote_id);
  if (!variantExternalId) return [];

  const conditions = asRecord(parsed.issue.conditions);
  if (conditions) {
    return Object.entries(conditions).flatMap(([key, value]) => {
      const condition = asRecord(value);
      if (!condition) return [];

      const gradeTenths = gradeToTenths(condition.condition ?? key);
      const priceCents = moneyToCents(condition.price);
      if (gradeTenths === null || priceCents === null) return [];

      return [
        {
          provider: 'zap' as const,
          variantExternalId,
          gradeTenths,
          priceCents,
          currency: 'USD' as const,
          conditionLabel: nonEmptyString(condition.description),
        },
      ];
    });
  }

  const gradeTenths = gradeToTenths(parsed.issue.condition);
  const priceCents = moneyToCents(parsed.issue.price);
  if (
    gradeTenths === null ||
    priceCents === null ||
    asNumber(parsed.issue.price) === null
  ) {
    return [];
  }

  return [
    {
      provider: 'zap',
      variantExternalId,
      gradeTenths,
      priceCents,
      currency: 'USD',
      conditionLabel: nonEmptyString(parsed.issue.favorite_condition),
    },
  ];
}

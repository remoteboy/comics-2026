import type { NormalizedUpdateResult } from '../types';
import {
  asArray,
  asRecord,
  booleanFlag,
  gradeToTenths,
  moneyToCents,
  nonEmptyString,
  normalizeIssueType,
} from '../utils';

export function normalizeZapUpdates(
  payload: unknown,
): NormalizedUpdateResult[] {
  const root = asRecord(payload);
  const updates = asArray(root?.comics ?? payload);

  return updates.flatMap((value) => {
    const update = asRecord(value);
    if (!update) return [];

    const variantExternalId = nonEmptyString(update.id);
    const number = nonEmptyString(update.number);
    if (!variantExternalId || !number) return [];

    return [
      {
        provider: 'zap' as const,
        variantExternalId,
        seriesExternalId: nonEmptyString(update.title_id),
        seriesName: nonEmptyString(update.title_name),
        number,
        variantLabel: nonEmptyString(update.variant) ?? '',
        type: normalizeIssueType(update.issue_type_name),
        gradeTenths: gradeToTenths(update.condition),
        currentPriceCents: moneyToCents(update.price),
        previousPriceCents: moneyToCents(update.previous_price),
        firstAppearanceOf: nonEmptyString(update.first_appearance_of),
        updatedAt: nonEmptyString(update.updated),
        isNew: booleanFlag(update.new),
      },
    ];
  });
}

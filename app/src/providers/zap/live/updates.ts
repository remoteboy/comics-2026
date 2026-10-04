import type { NormalizedUpdateResult } from '../../types';
import { asArray, asRecord, moneyToCents, nonEmptyString } from '../../utils';

export function normalizeCurrentZapUpdates(
  payload: unknown,
): NormalizedUpdateResult[] {
  return asArray(payload).flatMap((value) => {
    const update = asRecord(value);
    if (!update) return [];

    const variantExternalId = nonEmptyString(update.issue_id);
    const number = nonEmptyString(update.issue_number);
    if (!variantExternalId || !number) return [];

    return [
      {
        provider: 'zap' as const,
        variantExternalId,
        seriesExternalId: nonEmptyString(update.title_id),
        seriesName: nonEmptyString(update.title_name),
        number,
        variantLabel: nonEmptyString(update.issue_variant) ?? '',
        type: update.issue_type_id === 2 ? 'annual' : 'issue',
        gradeTenths: 94,
        currentPriceCents: moneyToCents(update.current_nm_price),
        previousPriceCents: moneyToCents(update.previous_nm_price),
        firstAppearanceOf: null,
        updatedAt: nonEmptyString(update.price_change_date),
        isNew: false,
      },
    ];
  });
}

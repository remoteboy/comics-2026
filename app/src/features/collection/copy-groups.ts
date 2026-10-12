import { formatMoney } from '@/lib/format';
import type { HoldingListItem } from './types';

export interface CopyGroup<T extends HoldingListItem = HoldingListItem> {
  key: string;
  item: T;
  copies: T[];
  quantity: number;
  valuedQuantity: number;
  unknownQuantity: number;
  knownTotalCents: number;
  minimumUnitCents: number | null;
  maximumUnitCents: number | null;
}

/** Display groups are not ownership records: histories and purchases stay separate. */
export function groupCopies<T extends HoldingListItem>(
  copies: T[],
): CopyGroup<T>[] {
  const groups = new Map<string, CopyGroup<T>>();
  for (const copy of copies) {
    const key = `${copy.variantId}:${copy.gradeTenths ?? 'unknown'}:${copy.boxId ?? 'unboxed'}`;
    let group = groups.get(key);
    if (!group) {
      group = {
        key,
        item: copy,
        copies: [],
        quantity: 0,
        valuedQuantity: 0,
        unknownQuantity: 0,
        knownTotalCents: 0,
        minimumUnitCents: null,
        maximumUnitCents: null,
      };
      groups.set(key, group);
    }
    group.copies.push(copy);
    group.quantity += copy.quantity;
    if (copy.valueCents === null) group.unknownQuantity += copy.quantity;
    else if (copy.quantity > 0) {
      group.valuedQuantity += copy.quantity;
      group.knownTotalCents += copy.valueCents * copy.quantity;
      group.minimumUnitCents = Math.min(
        group.minimumUnitCents ?? copy.valueCents,
        copy.valueCents,
      );
      group.maximumUnitCents = Math.max(
        group.maximumUnitCents ?? copy.valueCents,
        copy.valueCents,
      );
    }
  }
  for (const group of groups.values()) {
    group.copies.sort((a, b) => a.holdingId - b.holdingId);
    group.item = group.copies[0];
  }
  return [...groups.values()];
}

export function groupUnitValue(group: CopyGroup): string {
  if (group.minimumUnitCents === group.maximumUnitCents)
    return formatMoney(group.minimumUnitCents);
  return `${formatMoney(group.minimumUnitCents)}–${formatMoney(group.maximumUnitCents)}`;
}

/** Human-readable copy ranges shared by management and history selection. */
export function copyLabels(copies: HoldingListItem[]): Map<number, string> {
  const labels = new Map<number, string>();
  let next = 1;
  for (const copy of [...copies].sort((a, b) => a.holdingId - b.holdingId)) {
    labels.set(
      copy.holdingId,
      copy.quantity > 1
        ? `Copies ${next}–${next + copy.quantity - 1}`
        : `Copy ${next}`,
    );
    next += copy.quantity;
  }
  return labels;
}

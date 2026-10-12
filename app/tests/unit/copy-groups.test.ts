import { describe, expect, it } from 'vitest';
import {
  copyLabels,
  groupCopies,
  groupUnitValue,
} from '@/features/collection/copy-groups';
import type { HoldingListItem } from '@/features/collection/types';

function copy(overrides: Partial<HoldingListItem> = {}): HoldingListItem {
  return {
    holdingId: 1,
    variantId: 1,
    issueNumber: '1',
    issueType: 'issue',
    variantName: '',
    gradeTenths: 94,
    quantity: 4,
    boxId: 56,
    valueCents: 1500,
    purchaseDate: null,
    purchasePriceCents: 399,
    imageKey: '1.jpg',
    firstAppearanceOf: null,
    ...overrides,
  };
}

describe('owned copy display groups', () => {
  it('shows restored and newly purchased copies together without inventing their values', () => {
    const copies = [
      copy(),
      copy({ holdingId: 2, quantity: 1, valueCents: null }),
      copy({
        holdingId: 3,
        quantity: 1,
        valueCents: null,
        purchasePriceCents: 500,
      }),
    ];
    const [group] = groupCopies(copies);
    expect(group).toMatchObject({
      quantity: 6,
      valuedQuantity: 4,
      unknownQuantity: 2,
      knownTotalCents: 6000,
    });
    expect(groupUnitValue(group)).toBe('$15.00');
    expect(group.copies).toHaveLength(3);
    expect(copies.map((item) => item.quantity)).toEqual([4, 1, 1]);
    expect(copies[2].purchasePriceCents).toBe(500);
  });

  it('keeps different grades, boxes and exact covers separate', () => {
    expect(
      groupCopies([
        copy(),
        copy({ holdingId: 2, gradeTenths: 93 }),
        copy({ holdingId: 3, boxId: null }),
        copy({ holdingId: 4, variantId: 2 }),
      ]),
    ).toHaveLength(4);
  });

  it('shows differing unit values as a range and keeps unknown distinct from zero', () => {
    const [group] = groupCopies([
      copy({ quantity: 1, valueCents: 0 }),
      copy({ holdingId: 2, quantity: 1, valueCents: 1500 }),
      copy({ holdingId: 3, quantity: 1, valueCents: null }),
    ]);
    expect(groupUnitValue(group)).toBe('$0.00–$15.00');
    expect(group).toMatchObject({
      knownTotalCents: 1500,
      valuedQuantity: 2,
      unknownQuantity: 1,
    });
    expect(groupUnitValue(groupCopies([copy({ valueCents: null })])[0])).toBe(
      '—',
    );
  });

  it('keeps management and history copy ranges consistent without reordering input', () => {
    const copies = [
      copy({ holdingId: 3, quantity: 1 }),
      copy(),
      copy({ holdingId: 2, quantity: 1 }),
    ];
    expect([...copyLabels(copies).values()]).toEqual([
      'Copies 1–4',
      'Copy 5',
      'Copy 6',
    ]);
    expect(groupCopies(copies)[0].item.holdingId).toBe(1);
    expect(copies.map((item) => item.holdingId)).toEqual([3, 1, 2]);
  });
});

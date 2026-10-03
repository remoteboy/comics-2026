import type { HoldingListItem } from '@/features/collection/types';

export type BoxType = 'long' | 'short' | 'magazine';

export interface BoxListItem {
  id: number;
  type: BoxType;
  label: string | null;
  holdingCount: number;
  copyCount: number;
  valueCents: number;
}

export interface BoxDetail extends BoxListItem {
  holdings: HoldingListItemWithSeries[];
}

export interface HoldingListItemWithSeries extends HoldingListItem {
  seriesName: string;
}

export interface BoxNavigation {
  previousId: number | null;
  nextId: number | null;
}

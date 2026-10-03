import type { HoldingListItem } from '@/features/collection/types';

export interface BoxListItem {
  id: number;
  type: 'long' | 'short' | 'magazine';
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

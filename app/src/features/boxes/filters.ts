import type { BoxType } from './types';

export interface BoxFilters {
  query: string;
  type: BoxType | 'all';
}

export function boxFilters(params: URLSearchParams): BoxFilters {
  const type = params.get('type');

  return {
    query: params.get('q')?.trim() ?? '',
    type:
      type === 'long' || type === 'short' || type === 'magazine' ? type : 'all',
  };
}

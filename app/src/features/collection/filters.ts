import type { SeriesHealthFilter, SeriesSort, SeriesStatus } from './types';

export interface CollectionFilters {
  query: string;
  status: SeriesStatus | 'all';
  health: SeriesHealthFilter;
  sort: SeriesSort;
}

export function collectionFilters(params: URLSearchParams): CollectionFilters {
  const status = params.get('status');
  const health = params.get('health');
  const sort = params.get('sort');

  return {
    query: params.get('q')?.trim() ?? '',
    status: status === 'ongoing' || status === 'ended' ? status : 'all',
    health:
      health === 'missing-value' ||
      health === 'zero-value' ||
      health === 'unboxed' ||
      health === 'stale-value'
        ? health
        : 'all',
    sort:
      sort === 'value' || sort === 'copies' || sort === 'issues'
        ? sort
        : 'title',
  };
}

export function collectionUrl(filters: CollectionFilters, page = 1): string {
  const params = new URLSearchParams();
  if (filters.query) params.set('q', filters.query);
  if (filters.status !== 'all') params.set('status', filters.status);
  if (filters.health !== 'all') params.set('health', filters.health);
  if (filters.sort !== 'title') params.set('sort', filters.sort);
  if (page > 1) params.set('page', String(page));

  const query = params.toString();
  return `/collection${query ? `?${query}` : ''}`;
}

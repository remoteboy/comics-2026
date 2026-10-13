import type { APIRoute } from 'astro';
import {
  browseFilters,
  browseSeries,
  browseParams,
} from '@/features/catalog/browse';
export const GET: APIRoute = async ({ url }) => {
  const headers = { 'Cache-Control': 'no-store' };
  const kind = url.searchParams.get('kind');
  const id = Number(url.searchParams.get('id'));
  const q = (url.searchParams.get('q') ?? '').trim();
  if (
    (kind !== 'creator' && kind !== 'publisher') ||
    !Number.isSafeInteger(id) ||
    id < 1
  )
    return Response.json(
      { error: 'Invalid search.' },
      { status: 400, headers },
    );
  if (q.length < 2) return Response.json({ items: [] }, { headers });
  const filters = {
    ...browseFilters(url.searchParams, kind),
    title: q.slice(0, 200),
    seriesId: null,
  };
  try {
    const result = await browseSeries(kind, id, filters);
    return Response.json(
      {
        items: result.items.slice(0, 12).map((series) => {
          const params = browseParams({
            ...filters,
            title: series.name,
            seriesId: series.id,
          });
          return {
            label: series.name,
            detail: `${series.issueCount} issues · ${series.copyCount} owned copies`,
            href: `/${kind === 'creator' ? 'creators' : 'publishers'}/${id}?${params}`,
          };
        }),
      },
      { headers },
    );
  } catch {
    return Response.json(
      {
        error: 'Series suggestions are unavailable. Press Enter to retry.',
      },
      { status: 503, headers },
    );
  }
};

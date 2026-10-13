import type { APIRoute } from 'astro';
import { browseFilters, browseIssues } from '@/features/catalog/browse';
import { positiveInt } from '@/lib/pagination';
export const GET: APIRoute = async ({ url }) => {
  const headers = { 'Cache-Control': 'no-store' };
  const id = Number(url.searchParams.get('id'));
  const seriesId = Number(url.searchParams.get('series'));
  if (
    !Number.isSafeInteger(id) ||
    id < 1 ||
    !Number.isSafeInteger(seriesId) ||
    seriesId < 1
  )
    return Response.json(
      { error: 'Invalid issue list.' },
      { status: 400, headers },
    );
  try {
    return Response.json(
      await browseIssues(
        'creator',
        id,
        browseFilters(url.searchParams, 'creator'),
        seriesId,
        positiveInt(url.searchParams.get('page')),
      ),
      { headers },
    );
  } catch {
    return Response.json(
      {
        error:
          'Issues could not be loaded. Retry or open the credited issues page.',
      },
      { status: 503, headers },
    );
  }
};

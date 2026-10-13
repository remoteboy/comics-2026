import type { APIRoute } from 'astro';
import { searchCatalogRecords } from '@/features/search/repository';
export const GET: APIRoute = async ({ url }) => {
  const headers = { 'Cache-Control': 'no-store' };
  const kind = url.searchParams.get('kind');
  if (kind !== 'creator' && kind !== 'publisher')
    return Response.json(
      { error: 'Choose creators or publishers.' },
      { status: 400, headers },
    );
  try {
    return Response.json(
      {
        items: await searchCatalogRecords(
          kind,
          url.searchParams.get('q') ?? '',
        ),
      },
      { headers },
    );
  } catch {
    return Response.json(
      { error: 'Search is unavailable. Use Search to try again.' },
      { status: 503, headers },
    );
  }
};

import type { APIRoute } from 'astro';
import { searchBoxes } from '@/features/boxes/search';
export const GET: APIRoute = async ({ url }) => {
  const headers = { 'Cache-Control': 'no-store' };
  try {
    return Response.json(
      {
        items: await searchBoxes(
          url.searchParams.get('q') ?? '',
          url.searchParams.get('type') ?? 'all',
        ),
      },
      { headers },
    );
  } catch {
    return Response.json(
      { error: 'Box suggestions are unavailable. Press Enter to retry.' },
      { status: 503, headers },
    );
  }
};

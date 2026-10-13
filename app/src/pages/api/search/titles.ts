import type { APIRoute } from 'astro';
import { searchCollection } from '@/features/search/repository';
export const GET: APIRoute = async ({ url }) => {
  const headers = { 'Cache-Control': 'no-store' };
  try {
    return Response.json(
      { items: await searchCollection(url.searchParams.get('q') ?? '') },
      { headers },
    );
  } catch {
    return Response.json(
      { error: 'Search is unavailable. Use Search collection to try again.' },
      { status: 503, headers },
    );
  }
};

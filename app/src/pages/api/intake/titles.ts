import type { APIRoute } from 'astro';
import { searchZapTitles, storeIntakeLookups } from '@/features/intake/catalog';
import { ComicVineIntakeClient } from '@/features/intake/comic-vine';
export const GET: APIRoute = async ({ url }) => {
  const headers = { 'Cache-Control': 'no-store' };
  const q = (url.searchParams.get('q') ?? '').trim();
  if (q.length < 2) return Response.json({ items: [] }, { headers });
  if (q.length > 200)
    return Response.json(
      { error: 'Use no more than 200 characters.' },
      { status: 400, headers },
    );
  const source = url.searchParams.get('source') ?? 'zap';
  if (!['zap', 'comic_vine'].includes(source))
    return Response.json(
      { error: 'Choose Zap or Comic Vine.' },
      { status: 400, headers },
    );
  const series = url.searchParams.get('series');
  const localSeriesId = series ? Number(series) : null;
  try {
    const results =
      source === 'zap'
        ? await searchZapTitles(q)
        : await new ComicVineIntakeClient().searchTitles(q);
    const titles = results.slice(0, 12);
    if (localSeriesId !== null) {
      if (!Number.isSafeInteger(localSeriesId) || localSeriesId < 1)
        throw new Error('Choose an existing collection title.');
      // A provider result may be a different title; selected identity is verified on intake/save.
    }
    const ids = await storeIntakeLookups(
      titles.map((title) => ({
        title,
        localSeriesId,
        issueNumber: '',
        issueType: 'issue',
        covers: [],
      })),
    );
    return Response.json(
      {
        items: titles.map((title, i) => ({
          label: title.name,
          detail:
            title.year && !title.name.includes(String(title.year))
              ? String(title.year)
              : source === 'zap'
                ? 'Zap title'
                : 'Comic Vine title',
          href:
            '/intake?' +
            new URLSearchParams({
              lookup: ids[i],
              source,
              ...(series ? { series } : {}),
            }),
        })),
      },
      { headers },
    );
  } catch (cause) {
    return Response.json(
      {
        error:
          cause instanceof Error
            ? cause.message
            : 'Title search is unavailable. Try Find titles.',
      },
      { status: 503, headers },
    );
  }
};

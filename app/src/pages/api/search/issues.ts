import type { APIRoute } from 'astro';
import { listSeriesHoldings } from '@/features/collection/series.repository';
export const GET: APIRoute = async ({ url }) => {
  const headers = { 'Cache-Control': 'no-store' };
  const id = Number(url.searchParams.get('series'));
  if (!Number.isSafeInteger(id) || id < 1)
    return Response.json(
      { error: 'Choose a series.' },
      { status: 400, headers },
    );
  const q = url.searchParams.get('q')?.trim().slice(0, 200) ?? '';
  if (!q) return Response.json({ items: [] }, { headers });
  try {
    const holdings = await listSeriesHoldings(id, q);
    const covers = new Map<
      number,
      { label: string; detail: string; href: string }
    >();
    const type = url.searchParams.get('type');
    for (const copy of holdings.filter(
      (copy) =>
        !['issue', 'annual'].includes(type ?? '') || copy.issueType === type,
    ))
      if (copy.quantity > 0 && !covers.has(copy.variantId))
        covers.set(copy.variantId, {
          label: `${copy.issueType === 'annual' ? 'Annual ' : '#'}${copy.issueNumber}`,
          detail: copy.variantName || 'Regular cover',
          href: `/comics/${copy.variantId}`,
        });
    return Response.json(
      { items: [...covers.values()].slice(0, 12) },
      { headers },
    );
  } catch {
    return Response.json(
      { error: 'Suggestions are unavailable. Use Filter to try again.' },
      { status: 503, headers },
    );
  }
};

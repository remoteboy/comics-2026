import type { APIRoute } from 'astro';
import {
  getEditableCopy,
  listIssueCovers,
} from '@/features/collection/copy-edit';
import {
  parseCopyGrade,
  isSameOriginForm,
} from '@/features/collection/copy-form';
import {
  fetchCopyValuation,
  zapCoverId,
  CopyValuationUnavailable,
} from '@/features/collection/copy-valuation';

export const prerender = false;
export const POST: APIRoute = async ({ request, url, params }) => {
  if (!isSameOriginForm(request, url))
    return Response.json(
      { error: 'Reload the collection form and try again.' },
      { status: 403 },
    );
  try {
    const id = Number(params.id);
    const copy =
      Number.isSafeInteger(id) && id > 0
        ? await getEditableCopy(id)
        : undefined;
    if (!copy)
      return Response.json({ error: 'Copy not found.' }, { status: 404 });
    const data = await request.formData();
    const variant = data.get('variantId');
    if (typeof variant !== 'string' || !/^\d+$/.test(variant))
      throw new Error('Choose a cover.');
    const variantId = Number(variant);
    const covers = await listIssueCovers(copy.issueId);
    if (!covers.some((cover) => cover.id === variantId))
      throw new Error('Choose a cover for this issue.');
    const grade = parseCopyGrade(data.get('grade'));
    const quote = await fetchCopyValuation(await zapCoverId(variantId), grade);
    return Response.json(
      {
        priceCents: quote.priceCents,
        gradeTenths: quote.gradeTenths,
        refreshedAt: quote.refreshedAt,
      },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (error) {
    return Response.json(
      {
        error:
          error instanceof Error ? error.message : 'Unable to check the value.',
      },
      {
        status: error instanceof CopyValuationUnavailable ? 503 : 400,
        headers: { 'Cache-Control': 'no-store' },
      },
    );
  }
};

import type { APIRoute } from 'astro';
import { loadIntakeLookup } from '@/features/intake/catalog';
import { fetchCopyValuation } from '@/features/collection/copy-valuation';
import { parseCopyGrade } from '@/features/collection/copy-form';
import {
  formText,
  limitedForm,
  sameOriginWrite,
} from '@/features/collection/write-form';
export const POST: APIRoute = async ({ request, url }) => {
  const json = (value: unknown, status = 200) =>
    Response.json(value, { status, headers: { 'Cache-Control': 'no-store' } });
  if (!sameOriginWrite(request, url))
    return json({ error: 'Reload the intake page and try again.' }, 403);
  try {
    const data = await limitedForm(request, 4096);
    const lookup = await loadIntakeLookup(formText(data, 'lookupId'));
    const cover = lookup.covers.find(
      (cover) => cover.externalId === formText(data, 'coverId'),
    );
    if (!cover) throw new Error('Choose a cover first.');
    if (lookup.title.source !== 'zap')
      throw new Error(
        'Choose a Zap cover for a Zap valuation, or enter a manual value.',
      );
    const value = await fetchCopyValuation(
      cover.externalId,
      parseCopyGrade(data.get('grade')),
    );
    return json({
      priceCents: value.priceCents,
      gradeTenths: value.gradeTenths,
    });
  } catch (cause) {
    return json(
      {
        error:
          cause instanceof Error
            ? cause.message
            : 'Value preview is unavailable.',
      },
      400,
    );
  }
};

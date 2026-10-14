import type { APIRoute } from 'astro';
import {
  lookupMetadata,
  MetadataLookupError,
} from '@/features/collection/metadata-lookup';
import { IntakeLookupError } from '@/features/intake/catalog';
import { MetadataEditConflict } from '@/features/collection/metadata-edit';
import {
  formInteger,
  formText,
  limitedForm,
  sameOriginWrite,
} from '@/features/collection/write-form';

export const prerender = false;
export const POST: APIRoute = async ({ request, url, params }) => {
  const headers = { 'Cache-Control': 'no-store' };
  if (!sameOriginWrite(request, url))
    return Response.json(
      { error: 'Reload the comic editor and try again.' },
      { status: 403, headers },
    );
  try {
    const id = Number(params.id);
    if (!Number.isSafeInteger(id) || id < 1)
      throw new Error('Choose a valid comic.');
    const data = await limitedForm(request, 2048);
    const source = formText(data, 'source');
    if (source !== 'zap' && source !== 'comic_vine')
      throw new Error('Choose Zap or Comic Vine.');
    const suggestions = await lookupMetadata(
      id,
      formInteger(data, 'expectedVersion'),
      source,
    );
    return Response.json(suggestions, { headers });
  } catch (cause) {
    return Response.json(
      {
        error:
          cause instanceof MetadataEditConflict ||
          cause instanceof MetadataLookupError ||
          cause instanceof IntakeLookupError
            ? cause.message
            : 'Details could not be fetched for this comic. Your edits are unchanged. Check the provider connection and matching title/cover, then retry.',
      },
      { status: cause instanceof MetadataEditConflict ? 409 : 400, headers },
    );
  }
};

import type { APIRoute } from 'astro';
import { moveCopies } from '@/features/collection/box-move';
import { CopyEditConflict } from '@/features/collection/copy-edit';
import {
  formText,
  limitedForm,
  sameOriginWrite,
} from '@/features/collection/write-form';

export const POST: APIRoute = async ({ request, url }) => {
  if (!sameOriginWrite(request, url))
    return new Response('Reload the collection page and try again.', {
      status: 403,
    });
  let returnTo = '/collection';
  try {
    const data = await limitedForm(request, 128 * 1024);
    const target = formText(data, 'returnTo');
    const parsed = new URL(target, url);
    if (
      parsed.origin === url.origin &&
      /^\/(?:comics|collection|boxes)\/\d+$/.test(parsed.pathname)
    )
      returnTo = parsed.pathname + parsed.search;
    const box = formText(data, 'boxId');
    if (box && !/^\d+$/.test(box)) throw new Error('Choose a valid box.');
    await moveCopies({
      requestId: formText(data, 'requestId'),
      copies: JSON.parse(formText(data, 'copies')),
      boxId: box ? Number(box) : null,
    });
    const destination = new URL(returnTo, url);
    destination.searchParams.delete('moveError');
    destination.searchParams.set('moved', '1');
    return new Response(null, {
      status: 303,
      headers: { Location: destination.pathname + destination.search },
    });
  } catch (cause) {
    const destination = new URL(returnTo, url);
    destination.searchParams.delete('moved');
    destination.searchParams.set(
      'moveError',
      cause instanceof CopyEditConflict
        ? cause.message
        : 'Unable to move these copies. Reload the page and choose a box again.',
    );
    return new Response(null, {
      status: 303,
      headers: { Location: destination.pathname + destination.search },
    });
  }
};

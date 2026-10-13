import {
  MAX_COVER_BYTES,
  validateCover,
  type UploadedCover,
} from '@/covers/upload';
import { CURRENT_ZAP_SUPABASE_URL } from '@/providers/zap/live';

export function safeProviderImage(value: string | null): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    const host = url.hostname.toLowerCase();
    if (url.protocol !== 'https:' || url.username || url.password || url.port)
      return null;
    const approved =
      host === new URL(CURRENT_ZAP_SUPABASE_URL).hostname ||
      host === 'zapkapowcomics.com' ||
      host === 'www.zapkapowcomics.com' ||
      host === 'cdn.zapkapowcomics.com' ||
      host === 'images.zapkapowcomics.com' ||
      host === 'comics.zapkapowcomics.com' ||
      host === 'zkc-club-covers.s3.us-east-1.amazonaws.com' ||
      (host === 's3.amazonaws.com' &&
        url.pathname.startsWith('/comicgeeks/comics/covers/')) ||
      /^comicvine\d*\.cbsistatic\.com$/.test(host);
    return approved ? url.href : null;
  } catch {
    return null;
  }
}
export async function downloadProviderCover(
  value: string,
  fetchImpl: typeof fetch = globalThis.fetch,
): Promise<UploadedCover> {
  const url = safeProviderImage(value);
  if (!url) throw new Error('Image host is not approved.');
  const response = await fetchImpl(url, {
    redirect: 'error',
    signal: AbortSignal.timeout(15000),
  });
  if (!response.ok) throw new Error('Image is unavailable.');
  if (Number(response.headers.get('content-length')) > MAX_COVER_BYTES)
    throw new Error('Image is too large.');
  const reader = response.body?.getReader();
  if (!reader) throw new Error('Image is empty.');
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > MAX_COVER_BYTES) {
        await reader.cancel();
        throw new Error('Image is too large.');
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }
  return validateCover(new File([bytes], 'provider-cover'));
}

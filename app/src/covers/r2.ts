import { coverPlaceholder } from '@/covers/placeholder';

const contentTypes: Record<string, string> = {
  gif: 'image/gif',
  jpeg: 'image/jpeg',
  jpg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
};

export interface R2CoverObject {
  body: BodyInit;
  httpEtag?: string;
  httpMetadata?: {
    contentType?: string;
  };
}

export interface R2CoverBucket {
  get(key: string): Promise<R2CoverObject | null>;
}

function contentTypeFor(key: string): string {
  const extension = key.split('.').pop()?.toLowerCase();
  return (extension && contentTypes[extension]) || 'application/octet-stream';
}

export async function r2CoverResponse(
  bucket: R2CoverBucket,
  key?: string,
): Promise<Response> {
  if (!key || !/^[a-zA-Z0-9._-]+$/.test(key)) {
    return coverPlaceholder();
  }

  const object = await bucket.get(key);
  if (!object) return coverPlaceholder();

  const headers = new Headers({
    'Cache-Control': 'public, max-age=86400',
    'X-Content-Type-Options': 'nosniff',
    'Content-Type': object.httpMetadata?.contentType ?? contentTypeFor(key),
  });

  if (object.httpEtag) headers.set('ETag', object.httpEtag);

  return new Response(object.body, { headers });
}

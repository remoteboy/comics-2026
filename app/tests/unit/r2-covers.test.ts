import { describe, expect, it } from 'vitest';

import {
  r2CoverResponse,
  type R2CoverBucket,
  type R2CoverObject,
} from '../../src/covers/r2';

function bucketWith(entries: Record<string, R2CoverObject>): R2CoverBucket {
  return {
    async get(key) {
      return entries[key] ?? null;
    },
  };
}

describe('R2 cover responses', () => {
  it('serves an R2 cover with cache and image headers', async () => {
    const response = await r2CoverResponse(
      bucketWith({
        'cover.jpg': {
          body: 'cover bytes',
          httpEtag: '"cover-etag"',
          httpMetadata: { contentType: 'image/jpeg' },
        },
      }),
      'cover.jpg',
    );

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('image/jpeg');
    expect(response.headers.get('cache-control')).toBe('public, max-age=86400');
    expect(response.headers.get('etag')).toBe('"cover-etag"');
    expect(await response.text()).toBe('cover bytes');
  });

  it('falls back to the placeholder when the object is missing', async () => {
    const response = await r2CoverResponse(bucketWith({}), 'missing.jpg');

    expect(response.headers.get('content-type')).toBe('image/svg+xml');
    expect(await response.text()).toContain('Cover unavailable');
  });

  it('rejects unsafe cover keys before reading R2', async () => {
    let reads = 0;
    const bucket: R2CoverBucket = {
      async get() {
        reads += 1;
        return null;
      },
    };

    const response = await r2CoverResponse(bucket, '../secret.jpg');

    expect(reads).toBe(0);
    expect(response.headers.get('content-type')).toBe('image/svg+xml');
  });
});

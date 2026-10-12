// @ts-ignore -- virtual module supplied by the Cloudflare Workers runtime.
import { env } from 'cloudflare:workers';

import type { CoverStorage, UploadedCover } from './upload';
import { r2CoverResponse, type R2CoverBucket } from '@/covers/r2';

interface CloudflareEnv {
  COVERS?: R2CoverBucket & {
    put(
      key: string,
      bytes: Uint8Array,
      options: { httpMetadata: { contentType: string } },
    ): Promise<unknown>;
    delete(key: string): Promise<void>;
  };
}

export async function coverResponse(key?: string): Promise<Response> {
  const bucket = (env as CloudflareEnv).COVERS;
  if (!bucket) {
    throw new Error('Cloudflare R2 binding COVERS is not configured.');
  }

  return r2CoverResponse(bucket, key);
}

export const coverStorage: CoverStorage = {
  async put(key: string, cover: UploadedCover) {
    const bucket = (env as CloudflareEnv).COVERS;
    if (!bucket) throw new Error('Cover storage is not configured.');
    await bucket.put(key, cover.bytes, {
      httpMetadata: { contentType: cover.contentType },
    });
  },
  async remove(key: string) {
    const bucket = (env as CloudflareEnv).COVERS;
    if (!bucket) throw new Error('Cover storage is not configured.');
    await bucket.delete(key);
  },
};

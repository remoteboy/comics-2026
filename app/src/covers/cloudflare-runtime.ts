// @ts-ignore -- virtual module supplied by the Cloudflare Workers runtime.
import { env } from 'cloudflare:workers';

import { r2CoverResponse, type R2CoverBucket } from '@/covers/r2';

interface CloudflareEnv {
  COVERS?: R2CoverBucket;
}

export async function coverResponse(key?: string): Promise<Response> {
  const bucket = (env as CloudflareEnv).COVERS;
  if (!bucket) {
    throw new Error('Cloudflare R2 binding COVERS is not configured.');
  }

  return r2CoverResponse(bucket, key);
}

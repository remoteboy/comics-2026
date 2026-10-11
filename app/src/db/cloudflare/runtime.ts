// @ts-ignore -- virtual module supplied by the Cloudflare Workers runtime.
import { env } from 'cloudflare:workers';

import type { MutationDatabase } from '@/db/database';
import { D1Database, type D1DatabaseLike } from '@/db/cloudflare/d1-database';

interface CloudflareEnv {
  COMICS_DB?: D1DatabaseLike;
}

export function createRuntimeDatabase(): MutationDatabase {
  const binding = (env as CloudflareEnv).COMICS_DB;
  if (!binding) {
    throw new Error('Cloudflare D1 binding COMICS_DB is not configured.');
  }

  return new D1Database(binding);
}

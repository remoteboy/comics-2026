// @ts-ignore -- virtual module supplied by the Cloudflare Workers runtime.
import { env } from 'cloudflare:workers';

import type { D1DatabaseLike } from '@/db/cloudflare/d1-database';

import { D1ZapSessionStore } from './d1-session-store';
import { sessionFromConfig } from './session';
import type { ZapLiveConfig, ZapSessionStore } from './types';

interface CloudflareEnv {
  COMICS_DB?: D1DatabaseLike;
  ZAP_SESSION_ENCRYPTION_KEY?: string;
}

export function createRuntimeZapSessionStore(
  config: ZapLiveConfig,
): ZapSessionStore {
  const cloudflareEnv = env as CloudflareEnv;

  if (!cloudflareEnv.COMICS_DB) {
    throw new Error('Cloudflare D1 binding COMICS_DB is not configured.');
  }
  if (!cloudflareEnv.ZAP_SESSION_ENCRYPTION_KEY) {
    throw new Error('ZAP_SESSION_ENCRYPTION_KEY is not configured.');
  }

  return new D1ZapSessionStore(
    cloudflareEnv.COMICS_DB,
    cloudflareEnv.ZAP_SESSION_ENCRYPTION_KEY,
    sessionFromConfig(config),
  );
}

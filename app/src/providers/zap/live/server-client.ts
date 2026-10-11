import { ZapSupabaseClient } from './client';
import { createRuntimeZapSessionStore } from './runtime-session-store';
import type { ZapLiveConfig, ZapSessionStore } from './types';

export function createZapSupabaseClient(
  config: ZapLiveConfig,
  fetchImpl: typeof fetch = (input, init) => globalThis.fetch(input, init),
  sessionStore?: ZapSessionStore,
): ZapSupabaseClient {
  const store = sessionStore ?? createRuntimeZapSessionStore(config);
  return new ZapSupabaseClient(config, fetchImpl, store);
}

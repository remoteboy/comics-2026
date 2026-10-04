import { ZapSupabaseClient } from './client';
import { FileZapSessionStore } from './file-session-store';
import { sessionFromConfig } from './session';
import type { ZapLiveConfig, ZapSessionStore } from './types';

export function createZapSupabaseClient(
  config: ZapLiveConfig,
  fetchImpl: typeof fetch = fetch,
  sessionStore?: ZapSessionStore,
): ZapSupabaseClient {
  const store =
    sessionStore ??
    new FileZapSessionStore(config.sessionPath, sessionFromConfig(config));

  return new ZapSupabaseClient(config, fetchImpl, store);
}

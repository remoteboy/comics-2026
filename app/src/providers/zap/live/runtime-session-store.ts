import { FileZapSessionStore } from './file-session-store';
import { sessionFromConfig } from './session';
import type { ZapLiveConfig, ZapSessionStore } from './types';

export function createRuntimeZapSessionStore(
  config: ZapLiveConfig,
): ZapSessionStore {
  return new FileZapSessionStore(config.sessionPath, sessionFromConfig(config));
}

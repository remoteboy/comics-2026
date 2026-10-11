import { runtimeEnvironment } from '@/platform/runtime-env';

import type { ZapLiveConfig } from './types';

export const CURRENT_ZAP_SUPABASE_URL =
  'https://tfwafsfsrnoymhdvjbgs.supabase.co';

export function zapLiveConfig(): ZapLiveConfig {
  const env = runtimeEnvironment();

  return {
    apiBaseUrl: env.ZAP_SUPABASE_URL ?? CURRENT_ZAP_SUPABASE_URL,
    publishableKey: env.ZAP_SUPABASE_PUBLISHABLE_KEY || undefined,
    accessToken: env.ZAP_ACCESS_TOKEN || undefined,
    refreshToken: env.ZAP_REFRESH_TOKEN || undefined,
    sessionPath: env.ZAP_SESSION_PATH || undefined,
  };
}

import type { ZapLiveConfig } from './types';

export const CURRENT_ZAP_SUPABASE_URL =
  'https://tfwafsfsrnoymhdvjbgs.supabase.co';

export function zapLiveConfig(): ZapLiveConfig {
  return {
    apiBaseUrl: import.meta.env.ZAP_SUPABASE_URL ?? CURRENT_ZAP_SUPABASE_URL,
    publishableKey: import.meta.env.ZAP_SUPABASE_PUBLISHABLE_KEY || undefined,
    accessToken: import.meta.env.ZAP_ACCESS_TOKEN || undefined,
  };
}

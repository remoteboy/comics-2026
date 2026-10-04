import { zapLiveConfig } from '@/providers/zap/live';

export interface ZapConfigurationStatus {
  configured: boolean;
  apiBaseUrl: string;
  profile: 'current-supabase';
}

export function getZapConfigurationStatus(): ZapConfigurationStatus {
  const config = zapLiveConfig();

  return {
    configured: Boolean(config.publishableKey && config.accessToken),
    apiBaseUrl: config.apiBaseUrl,
    profile: 'current-supabase',
  };
}

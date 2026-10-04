import { zapLiveConfig } from '@/providers/zap/live';

export interface ZapConfigurationStatus {
  configured: boolean;
  refreshConfigured: boolean;
  apiBaseUrl: string;
  profile: 'current-supabase';
}

export function getZapConfigurationStatus(): ZapConfigurationStatus {
  const config = zapLiveConfig();

  return {
    configured: Boolean(
      config.publishableKey && (config.accessToken || config.refreshToken),
    ),
    refreshConfigured: Boolean(config.refreshToken),
    apiBaseUrl: config.apiBaseUrl,
    profile: 'current-supabase',
  };
}

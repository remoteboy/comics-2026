export type ZapLiveOperation =
  | 'search'
  | 'variants'
  | 'issue'
  | 'raw_valuation'
  | 'graded_valuation'
  | 'updates';

export type ZapLiveErrorCode =
  | 'not_configured'
  | 'session_expired'
  | 'refresh_failed'
  | 'unauthorized'
  | 'endpoint_unavailable'
  | 'invalid_response'
  | 'network_error';

export interface ZapLiveConfig {
  apiBaseUrl: string;
  publishableKey?: string;
  accessToken?: string;
  refreshToken?: string;
  sessionPath?: string;
}

export interface ZapSession {
  accessToken?: string;
  refreshToken?: string;
  expiresAt?: number;
}

export interface ZapSessionStore {
  load(): Promise<ZapSession | null>;
  save(session: ZapSession): Promise<void>;
}

export interface ZapProbeTarget {
  seriesName: string;
  seriesExternalId: string;
  variantExternalId: string;
  issueNumber: string;
}

export interface ZapProbeCheck {
  operation: ZapLiveOperation;
  status: 'passed' | 'failed' | 'skipped';
  detail: string;
  latencyMs?: number;
}

export interface ZapProbeResult {
  configured: boolean;
  apiBaseUrl: string;
  profile: 'current-supabase';
  target: ZapProbeTarget | null;
  checks: ZapProbeCheck[];
}

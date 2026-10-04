import type { ZapLiveConfig, ZapSession } from './types';

const REFRESH_LEEWAY_SECONDS = 60;

function decodeJwtPayload(token: string): Record<string, unknown> | null {
  const [, payload] = token.split('.');
  if (!payload) return null;

  try {
    const normalized = payload.replaceAll('-', '+').replaceAll('_', '/');
    const padded = normalized.padEnd(
      normalized.length + ((4 - (normalized.length % 4)) % 4),
      '=',
    );
    return JSON.parse(atob(padded)) as Record<string, unknown>;
  } catch {
    return null;
  }
}

export function accessTokenExpiresAt(token: string): number | undefined {
  const exp = decodeJwtPayload(token)?.exp;
  return typeof exp === 'number' && Number.isFinite(exp) ? exp : undefined;
}

export function sessionFromConfig(config: ZapLiveConfig): ZapSession | null {
  if (!config.accessToken && !config.refreshToken) return null;

  return {
    accessToken: config.accessToken,
    refreshToken: config.refreshToken,
    expiresAt: config.accessToken
      ? accessTokenExpiresAt(config.accessToken)
      : undefined,
  };
}

export function sessionNeedsRefresh(
  session: ZapSession,
  nowSeconds = Math.floor(Date.now() / 1000),
): boolean {
  if (!session.accessToken) return true;
  if (!session.expiresAt) return false;

  return session.expiresAt <= nowSeconds + REFRESH_LEEWAY_SECONDS;
}

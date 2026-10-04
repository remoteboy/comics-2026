import type { ZapLiveErrorCode } from './types';

interface SupabaseErrorBody {
  code?: unknown;
  message?: unknown;
  hint?: unknown;
}

function safeErrorDetail(body: string): string | null {
  try {
    const parsed = JSON.parse(body) as SupabaseErrorBody;
    const parts = [parsed.code, parsed.message, parsed.hint].filter(
      (value): value is string =>
        typeof value === 'string' && value.trim() !== '',
    );
    return parts.length ? parts.join(' · ') : null;
  } catch {
    return null;
  }
}

function errorCodeForStatus(status: number): ZapLiveErrorCode {
  if (status === 401 || status === 403) return 'unauthorized';
  if (status === 404 || status === 410) return 'endpoint_unavailable';
  return 'invalid_response';
}

export class ZapLiveError extends Error {
  constructor(
    readonly code: ZapLiveErrorCode,
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = 'ZapLiveError';
  }
}

export function zapLiveHttpError(status: number, body: string): ZapLiveError {
  const detail = safeErrorDetail(body);
  const message = detail
    ? `Zap returned HTTP ${status}: ${detail}`
    : `Zap returned HTTP ${status}.`;

  return new ZapLiveError(errorCodeForStatus(status), message, status);
}

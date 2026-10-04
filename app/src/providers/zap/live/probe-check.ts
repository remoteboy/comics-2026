import { ZapLiveError } from './error';
import type { ZapLiveOperation, ZapProbeCheck } from './types';

function errorDetail(error: unknown): string {
  if (error instanceof ZapLiveError) return error.message;
  return error instanceof Error ? error.message : 'Unknown Zap error.';
}

export async function timedProbeCheck(
  operation: ZapLiveOperation,
  callback: () => Promise<string>,
): Promise<ZapProbeCheck> {
  const started = performance.now();

  try {
    const detail = await callback();
    return {
      operation,
      status: 'passed',
      detail,
      latencyMs: Math.round(performance.now() - started),
    };
  } catch (error) {
    return {
      operation,
      status: 'failed',
      detail: errorDetail(error),
      latencyMs: Math.round(performance.now() - started),
    };
  }
}

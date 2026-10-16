import type { APIRoute } from 'astro';

import { getZapConfigurationStatus } from '@/features/providers/zap-status';
import { getValuationBackfillProgress } from '@/features/valuation/repository';
import { refreshZapValuationBackfill } from '@/features/valuation/sync';

export const prerender = false;

export const POST: APIRoute = async ({ request, url }) => {
  if (
    request.headers.get('origin') !== url.origin ||
    request.headers.get('sec-fetch-site') === 'cross-site'
  )
    return Response.json(
      { error: 'Reload Valuations before submitting.' },
      { status: 403 },
    );
  const configuration = getZapConfigurationStatus();

  if (!configuration.configured) {
    return Response.json(
      { error: 'Zap live credentials are not configured.' },
      { status: 503 },
    );
  }

  try {
    const result = await refreshZapValuationBackfill();
    const progress = await getValuationBackfillProgress();
    return Response.json({ result, progress });
  } catch (error) {
    return Response.json(
      {
        error:
          error instanceof Error ? error.message : 'Valuation sync failed.',
      },
      { status: 500 },
    );
  }
};

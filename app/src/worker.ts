// @ts-ignore -- supplied by the Cloudflare adapter during its Worker build.
import { handle } from '@astrojs/cloudflare/handler';
import { runtimeEnvironment } from '@/platform/runtime-env';
import { runScheduledValuations } from '@/features/valuation/scheduled';

export default {
  fetch: handle,
  async scheduled(controller: { scheduledTime: number }) {
    if (runtimeEnvironment().VALUATION_SCHEDULE_ENABLED !== 'true') return;
    const result = await runScheduledValuations({
      scheduledTime: controller.scheduledTime,
    });
    console.info('Scheduled valuation refresh', {
      status: result.status,
      runId: 'runId' in result ? result.runId : undefined,
    });
    if (result.status === 'failed')
      throw new Error(
        'Scheduled valuation refresh failed; see Valuations and Providers.',
      );
  },
};

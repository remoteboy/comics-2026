import type { QueryDatabase } from '@/db/database';

import {
  normalizeCurrentZapIssue,
  normalizeCurrentZapVariants,
} from './catalog';
import { ZapSupabaseClient } from './client';
import { timedProbeCheck } from './probe-check';
import { getZapProbeTarget } from './probe-repository';
import type { ZapLiveConfig, ZapProbeResult } from './types';
import { normalizeCurrentZapUpdates } from './updates';
import {
  normalizeCurrentZapGradedValuations,
  normalizeCurrentZapRawValuations,
} from './valuation';

interface ProbeOptions {
  config: ZapLiveConfig;
  db?: QueryDatabase;
  fetchImpl?: typeof fetch;
}

export async function probeZapLive({
  config,
  db,
  fetchImpl,
}: ProbeOptions): Promise<ZapProbeResult> {
  const target = await getZapProbeTarget(db);

  if (!config.publishableKey || !config.accessToken) {
    return {
      configured: false,
      apiBaseUrl: config.apiBaseUrl,
      profile: 'current-supabase',
      target,
      checks: [
        {
          operation: 'search',
          status: 'skipped',
          detail:
            'Set ZAP_SUPABASE_PUBLISHABLE_KEY and ZAP_ACCESS_TOKEN locally before probing live Zap.',
        },
      ],
    };
  }

  if (!target) {
    return {
      configured: true,
      apiBaseUrl: config.apiBaseUrl,
      profile: 'current-supabase',
      target: null,
      checks: [
        {
          operation: 'search',
          status: 'skipped',
          detail: 'No preserved Zap series/variant pair is available to probe.',
        },
      ],
    };
  }

  const client = new ZapSupabaseClient(config, fetchImpl);
  let titleSlug: string | null = null;
  let issueSlug: string | null = null;
  let issuePayload: unknown;

  const search = await timedProbeCheck('search', async () => {
    const results = await client.searchTitles(target.seriesName, 15);
    const match = results.find(
      (row) => String(row.id) === target.seriesExternalId,
    );
    if (!match) {
      throw new Error(
        `Search returned no row for preserved Zap title ${target.seriesExternalId}.`,
      );
    }

    titleSlug = match.slug;
    return `Matched ${match.name} to preserved title ID ${target.seriesExternalId}.`;
  });

  const variants = await timedProbeCheck('variants', async () => {
    if (!titleSlug) {
      throw new Error('Title search failed, so variants were skipped.');
    }

    const payload = await client.issuesForTitle({
      titleSlug,
      issueNumber: target.issueNumber,
    });
    const normalized = normalizeCurrentZapVariants(payload);
    const match = payload.issues.find(
      (row) => String(row.id) === target.variantExternalId,
    );

    if (!match) {
      throw new Error(
        `Issue-number lookup did not return preserved variant ${target.variantExternalId}.`,
      );
    }

    issueSlug = match.issue_slug_out;
    return `${normalized.length} cover row${normalized.length === 1 ? '' : 's'} found for #${target.issueNumber}; preserved variant matched.`;
  });

  const issue = await timedProbeCheck('issue', async () => {
    if (!titleSlug || !issueSlug) {
      throw new Error('Variant lookup failed, so issue detail was skipped.');
    }

    issuePayload = await client.issueDetails(titleSlug, issueSlug);
    const normalized = normalizeCurrentZapIssue(issuePayload);
    if (!normalized) throw new Error('Issue detail could not be normalized.');

    return `Issue #${normalized.number} detail normalized successfully.`;
  });

  const rawValuation = await timedProbeCheck('raw_valuation', async () => {
    if (!issuePayload) {
      throw new Error('Issue detail failed, so raw valuation was skipped.');
    }

    const normalized = normalizeCurrentZapRawValuations(issuePayload);
    if (!normalized.length) {
      throw new Error('Issue detail contained no current NM valuation.');
    }

    return 'Current raw NM (9.4) valuation normalized successfully.';
  });

  const gradedValuation = await timedProbeCheck(
    'graded_valuation',
    async () => {
      const payload = await client.gradedPrices(target.variantExternalId);
      const normalized = normalizeCurrentZapGradedValuations(
        payload,
        target.variantExternalId,
      );

      return normalized.length
        ? `${normalized.length} graded valuation${normalized.length === 1 ? '' : 's'} returned.`
        : 'Graded-price endpoint responded; this target has no graded valuations.';
    },
  );

  const updates = await timedProbeCheck('updates', async () => {
    const payload = await client.recentPriceChanges(1, 0);
    const normalized = normalizeCurrentZapUpdates(payload);
    if (!normalized.length) {
      throw new Error(
        'Recent price-change feed returned no normalizable rows.',
      );
    }

    return 'Latest database-wide price change normalized successfully.';
  });

  return {
    configured: true,
    apiBaseUrl: config.apiBaseUrl,
    profile: 'current-supabase',
    target,
    checks: [search, variants, issue, rawValuation, gradedValuation, updates],
  };
}

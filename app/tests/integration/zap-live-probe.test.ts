import { afterEach, describe, expect, it, vi } from 'vitest';

import { probeZapLive } from '@/providers/zap/live/probe';

import {
  createTestDatabase,
  type TestDatabase,
} from '../helpers/test-database';

let db: TestDatabase | undefined;

afterEach(() => {
  db?.close();
  db = undefined;
});

function jsonResponse(payload: unknown): Response {
  return new Response(JSON.stringify(payload), { status: 200 });
}

describe('probeZapLive', () => {
  it('stays safely disabled without current Supabase credentials', async () => {
    db = createTestDatabase();

    const result = await probeZapLive({
      config: { apiBaseUrl: 'https://zap-project.example.test' },
      db,
    });

    expect(result.configured).toBe(false);
    expect(result.profile).toBe('current-supabase');
    expect(result.target).toMatchObject({
      seriesName: 'Alpha Adventures',
      seriesExternalId: 'series-101',
      variantExternalId: '101',
      issueNumber: '1',
    });
    expect(result.checks).toEqual([
      expect.objectContaining({ operation: 'search', status: 'skipped' }),
    ]);
  });

  it('probes current search, variant, issue, pricing and update contracts', async () => {
    db = createTestDatabase();

    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);

      if (url.endsWith('/rest/v1/rpc/search_titles_normalized')) {
        return jsonResponse([
          {
            id: 'series-101',
            name: 'Alpha Adventures',
            slug: 'alpha-adventures',
            views: 1,
            primary_issue_id: 101,
          },
        ]);
      }

      if (
        url.endsWith('/rest/v1/rpc/get_issues_for_title_filtered_paginated')
      ) {
        return jsonResponse({
          issues: [
            {
              id: 101,
              number: '1',
              variant: '',
              key_issue: '0',
              first_appearance_of: null,
              cover_url: null,
              cover_date: 'January 2020',
              title_id: 'series-101',
              issue_type_id: 1,
              story_title: null,
              publisher: 'Example',
              cover_price: 3.99,
              writer: null,
              penciller: null,
              cover_artist: null,
              inker: null,
              details: null,
              nm_price: 10,
              total_issue_count: 1,
              title_slug_out: 'alpha-adventures',
              issue_slug_out: '1-101',
            },
          ],
          total_count: 1,
        });
      }

      if (url.endsWith('/rest/v1/rpc/get_issue_details_v2')) {
        return jsonResponse({
          id: 101,
          number: '1',
          variant: '',
          key_issue: '0',
          first_appearance_of: null,
          cover_url: null,
          cover_date: 'January 2020',
          title_id: 'series-101',
          issue_type_id: 1,
          issue_type_name: 'Issue',
          story_title: '',
          publisher: 'Example',
          cover_price: 3.99,
          writer: null,
          penciller: null,
          cover_artist: null,
          inker: null,
          details: null,
          title_name: 'Alpha Adventures',
          current_nm_price: 10,
          previous_nm_price: 8,
          current_price_effective_date: '2026-10-04T08:00:00Z',
          historical_prices: [],
          title_slug_out: 'alpha-adventures',
          issue_slug_out: '1-101',
        });
      }

      if (url.includes('/rest/v1/effective_graded_prices?')) {
        return jsonResponse([]);
      }

      if (
        url.endsWith('/rest/v1/rpc/get_recent_price_changes_whole_database')
      ) {
        return jsonResponse([
          {
            issue_id: 999,
            issue_number: '7',
            issue_variant: '',
            title_id: 777,
            issue_type_id: 1,
            title_name: 'Changed Series (2026)',
            cover_url: null,
            current_nm_price: 20,
            previous_nm_price: 10,
            price_change_date: '2026-10-04T08:00:00Z',
            issue_updated_at: '2026-10-04T08:00:00Z',
            issue_slug: '7-999',
            title_slug: 'changed-series-2026',
            total_count: 1,
          },
        ]);
      }

      return new Response('', { status: 404 });
    }) as typeof fetch;

    const result = await probeZapLive({
      config: {
        apiBaseUrl: 'https://zap-project.example.test',
        publishableKey: 'public-test-key',
        accessToken: 'access-test-token',
      },
      db,
      fetchImpl: fetchMock,
    });

    expect(result.configured).toBe(true);
    expect(result.checks).toHaveLength(6);
    expect(result.checks.every((check) => check.status === 'passed')).toBe(
      true,
    );
    expect(
      result.checks.find((check) => check.operation === 'raw_valuation')
        ?.detail,
    ).toContain('9.4');
    expect(
      result.checks.find((check) => check.operation === 'graded_valuation')
        ?.detail,
    ).toContain('no graded valuations');
  });
});

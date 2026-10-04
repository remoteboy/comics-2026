import { describe, expect, it, vi } from 'vitest';

import { ZapSupabaseClient } from '@/providers/zap/live/client';
import { ZapLiveError } from '@/providers/zap/live/error';

function jsonResponse(payload: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(payload), {
    status: 200,
    headers: { 'content-type': 'application/json' },
    ...init,
  });
}

function client(fetchImpl: typeof fetch): ZapSupabaseClient {
  return new ZapSupabaseClient(
    {
      apiBaseUrl: 'https://zap-project.example.test',
      publishableKey: 'publishable-test-key',
      accessToken: 'access-test-token',
    },
    fetchImpl,
  );
}

describe('ZapSupabaseClient', () => {
  it('calls title search with server-side Supabase auth headers', async () => {
    const fetchMock = vi.fn(
      async (_input: RequestInfo | URL, init?: RequestInit) => {
        const headers = new Headers(init?.headers);
        expect(headers.get('apikey')).toBe('publishable-test-key');
        expect(headers.get('authorization')).toBe('Bearer access-test-token');
        return jsonResponse([]);
      },
    ) as typeof fetch;

    await client(fetchMock).searchTitles('Miracleman', 15);

    const [input, init] = vi.mocked(fetchMock).mock.calls[0];
    expect(String(input)).toBe(
      'https://zap-project.example.test/rest/v1/rpc/search_titles_normalized',
    );
    expect(init?.method).toBe('POST');
    expect(init?.body).toBe(
      JSON.stringify({ search_query: 'Miracleman', result_limit: 15 }),
    );
  });

  it('sends the observed issue-number filter RPC body', async () => {
    const fetchMock = vi.fn(async () =>
      jsonResponse({ issues: [], total_count: 0 }),
    ) as typeof fetch;

    await client(fetchMock).issuesForTitle({
      titleSlug: 'example-2026',
      issueNumber: '1/2',
    });

    const [input, init] = vi.mocked(fetchMock).mock.calls[0];
    expect(String(input)).toBe(
      'https://zap-project.example.test/rest/v1/rpc/get_issues_for_title_filtered_paginated',
    );
    expect(JSON.parse(String(init?.body))).toEqual({
      p_title_slug: 'example-2026',
      p_page: 1,
      p_page_size: 5000,
      p_search_query: '1/2',
      p_user_id: null,
      p_filter: 'all',
      p_issue_type_ids: [1],
      p_fetch_only_key_issues: false,
    });
  });

  it('matches the browser object response contract for issue detail', async () => {
    const fetchMock = vi.fn(
      async (_input: RequestInfo | URL, init?: RequestInit) => {
        const headers = new Headers(init?.headers);
        expect(headers.get('accept')).toBe('application/vnd.pgrst.object+json');
        return jsonResponse({ id: 101 });
      },
    ) as typeof fetch;

    await client(fetchMock).issueDetails('alpha-adventures', '1-101');

    const [input, init] = vi.mocked(fetchMock).mock.calls[0];
    expect(String(input)).toBe(
      'https://zap-project.example.test/rest/v1/rpc/get_issue_details_v2',
    );
    expect(init?.body).toBe(
      JSON.stringify({
        p_title_slug: 'alpha-adventures',
        p_issue_slug: '1-101',
      }),
    );
  });

  it('uses the effective graded-price view observed in the current app', async () => {
    const fetchMock = vi.fn(async () => jsonResponse([])) as typeof fetch;

    await client(fetchMock).gradedPrices(196357);

    const [input] = vi.mocked(fetchMock).mock.calls[0];
    expect(String(input)).toBe(
      'https://zap-project.example.test/rest/v1/effective_graded_prices?select=grade%2Cprice%2Csource&issue_id=eq.196357',
    );
  });

  it('posts the observed recent-price-change cursor', async () => {
    const fetchMock = vi.fn(async () => jsonResponse([])) as typeof fetch;

    await client(fetchMock).recentPriceChanges(15, 30);

    const [input, init] = vi.mocked(fetchMock).mock.calls[0];
    expect(String(input)).toBe(
      'https://zap-project.example.test/rest/v1/rpc/get_recent_price_changes_whole_database',
    );
    expect(init?.body).toBe(
      JSON.stringify({ page_limit: 15, page_offset: 30 }),
    );
  });

  it('refuses live calls until both current credentials are configured', async () => {
    const zap = new ZapSupabaseClient({
      apiBaseUrl: 'https://zap-project.example.test',
    });

    await expect(zap.searchTitles('test')).rejects.toMatchObject({
      code: 'not_configured',
    });
  });

  it('surfaces sanitized Supabase auth errors without exposing credentials', async () => {
    const fetchMock = vi.fn(async () =>
      jsonResponse(
        {
          message: 'Invalid API key',
          hint: 'Double check your Supabase API key.',
        },
        { status: 401 },
      ),
    ) as typeof fetch;
    const zap = new ZapSupabaseClient(
      {
        apiBaseUrl: 'https://zap-project.example.test',
        publishableKey: 'public-key',
        accessToken: 'sentinel-access-token',
      },
      fetchMock,
    );

    const error = await zap.searchTitles('test').catch((caught) => caught);
    expect(error).toBeInstanceOf(ZapLiveError);
    expect(error).toMatchObject({ code: 'unauthorized', status: 401 });
    expect(String(error)).toContain('Invalid API key');
    expect(String(error)).not.toContain('public-key');
    expect(String(error)).not.toContain('sentinel-access-token');
  });

  it('classifies missing current endpoints separately from auth failures', async () => {
    const fetchMock = vi.fn(
      async () => new Response('', { status: 404 }),
    ) as typeof fetch;

    await expect(client(fetchMock).searchTitles('test')).rejects.toMatchObject({
      code: 'endpoint_unavailable',
      status: 404,
    });
  });
});

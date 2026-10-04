import type {
  ZapGradedPriceRow,
  ZapIssueDetail,
  ZapIssuesForTitleResponse,
  ZapRecentPriceChangeRow,
  ZapTitleSearchRow,
} from './api-types';
import { ZapLiveError, zapLiveHttpError } from './error';
import type { ZapLiveConfig } from './types';

interface IssuesForTitleOptions {
  titleSlug: string;
  issueNumber?: string;
  page?: number;
  pageSize?: number;
}

export class ZapSupabaseClient {
  constructor(
    private readonly config: ZapLiveConfig,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  get configured(): boolean {
    return Boolean(this.config.publishableKey && this.config.accessToken);
  }

  searchTitles(
    searchQuery: string,
    resultLimit = 15,
  ): Promise<ZapTitleSearchRow[]> {
    return this.rpc('search_titles_normalized', {
      search_query: searchQuery,
      result_limit: resultLimit,
    });
  }

  issuesForTitle({
    titleSlug,
    issueNumber = '',
    page = 1,
    pageSize = 5000,
  }: IssuesForTitleOptions): Promise<ZapIssuesForTitleResponse> {
    return this.rpc('get_issues_for_title_filtered_paginated', {
      p_title_slug: titleSlug,
      p_page: page,
      p_page_size: pageSize,
      p_search_query: issueNumber,
      p_user_id: null,
      p_filter: 'all',
      p_issue_type_ids: [1],
      p_fetch_only_key_issues: false,
    });
  }

  issueDetails(titleSlug: string, issueSlug: string): Promise<ZapIssueDetail> {
    return this.rpc(
      'get_issue_details_v2',
      {
        p_title_slug: titleSlug,
        p_issue_slug: issueSlug,
      },
      'application/vnd.pgrst.object+json',
    );
  }

  gradedPrices(issueId: string | number): Promise<ZapGradedPriceRow[]> {
    const params = new URLSearchParams({
      select: 'grade,price,source',
      issue_id: `eq.${issueId}`,
    });

    return this.request(`/rest/v1/effective_graded_prices?${params}`);
  }

  recentPriceChanges(
    pageLimit = 15,
    pageOffset = 0,
  ): Promise<ZapRecentPriceChangeRow[]> {
    return this.rpc('get_recent_price_changes_whole_database', {
      page_limit: pageLimit,
      page_offset: pageOffset,
    });
  }

  private rpc<T>(
    name: string,
    payload: Record<string, unknown>,
    accept = 'application/json',
  ): Promise<T> {
    return this.request(`/rest/v1/rpc/${encodeURIComponent(name)}`, {
      method: 'POST',
      headers: { accept },
      body: JSON.stringify(payload),
    });
  }

  private async request<T>(path: string, init: RequestInit = {}): Promise<T> {
    if (!this.config.publishableKey || !this.config.accessToken) {
      throw new ZapLiveError(
        'not_configured',
        'Zap live access requires a publishable key and access token.',
      );
    }

    const url = new URL(path, `${this.config.apiBaseUrl.replace(/\/$/, '')}/`);
    const headers = new Headers(init.headers);

    if (!headers.has('accept')) headers.set('accept', 'application/json');
    headers.set('apikey', this.config.publishableKey);
    headers.set('authorization', `Bearer ${this.config.accessToken}`);
    headers.set('accept-profile', 'public');
    headers.set('x-client-info', 'zapkapow-comics-web');

    if (init.body) {
      headers.set('content-type', 'application/json');
      headers.set('content-profile', 'public');
    }

    let response: Response;

    try {
      response = await this.fetchImpl(url, { ...init, headers });
    } catch (error) {
      throw new ZapLiveError(
        'network_error',
        error instanceof Error ? error.message : 'Zap request failed.',
      );
    }

    const body = await response.text();

    if (!response.ok) throw zapLiveHttpError(response.status, body);

    try {
      return JSON.parse(body) as T;
    } catch {
      throw new ZapLiveError(
        'invalid_response',
        'Zap returned a non-JSON response.',
        response.status,
      );
    }
  }
}

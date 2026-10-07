import type {
  ZapEbaySoldLookupRequest,
  ZapEbaySoldLookupResponse,
  ZapGradedPriceRow,
  ZapIssueConditionRow,
  ZapIssueDetail,
  ZapIssuePriceRow,
  ZapIssuesForTitleResponse,
  ZapRecentPriceChangeRow,
  ZapTitleSearchRow,
} from './api-types';
import { ZapLiveError, zapLiveHttpError } from './error';
import { MemoryZapSessionStore } from './session-store';
import {
  accessTokenExpiresAt,
  sessionFromConfig,
  sessionNeedsRefresh,
} from './session';
import type { ZapLiveConfig, ZapSession, ZapSessionStore } from './types';

interface IssuesForTitleOptions {
  titleSlug: string;
  issueNumber?: string;
  page?: number;
  pageSize?: number;
}

interface RefreshResponse {
  access_token?: unknown;
  refresh_token?: unknown;
  expires_in?: unknown;
}

export class ZapSupabaseClient {
  private refreshPromise: Promise<ZapSession> | null = null;

  constructor(
    private readonly config: ZapLiveConfig,
    private readonly fetchImpl: typeof fetch = fetch,
    private readonly sessionStore: ZapSessionStore = new MemoryZapSessionStore(
      sessionFromConfig(config),
    ),
  ) {}

  get configured(): boolean {
    return Boolean(
      this.config.publishableKey &&
      (this.config.accessToken || this.config.refreshToken),
    );
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

  issueConditions(): Promise<ZapIssueConditionRow[]> {
    return this.request(
      '/rest/v1/issue_conditions?select=*&order=condition.desc',
    );
  }

  async latestRawPrice(
    issueId: string | number,
  ): Promise<ZapIssuePriceRow | null> {
    const params = new URLSearchParams({
      select:
        'id,issue_id,price,price_guides(effective_date),issues!fk_issue_prices_issue(title_id)',
      issue_id: `in.(${issueId})`,
      order: 'price_guide_id.desc,id.desc',
      limit: '1',
    });
    const rows = await this.request<ZapIssuePriceRow[]>(
      `/rest/v1/issue_prices?${params}`,
    );
    return rows[0] ?? null;
  }

  gradedPrices(issueId: string | number): Promise<ZapGradedPriceRow[]> {
    const params = new URLSearchParams({
      select: 'grade,price,source',
      issue_id: `eq.${issueId}`,
    });

    return this.request(`/rest/v1/effective_graded_prices?${params}`);
  }

  ebaySoldLookup(
    payload: ZapEbaySoldLookupRequest,
  ): Promise<ZapEbaySoldLookupResponse> {
    return this.request('/functions/v1/ebay-sold-lookup', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
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

  refreshSession(): Promise<ZapSession> {
    return this.getSession(true);
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

  private async getSession(forceRefresh = false): Promise<ZapSession> {
    const session = await this.sessionStore.load();

    if (!session) {
      throw new ZapLiveError(
        'not_configured',
        'Zap live access requires an access token or refresh token.',
      );
    }

    if (!forceRefresh && !sessionNeedsRefresh(session)) return session;

    if (!session.refreshToken) {
      if (session.accessToken && !forceRefresh) {
        throw new ZapLiveError(
          'session_expired',
          'Zap access token expired and no refresh token is configured.',
        );
      }

      throw new ZapLiveError(
        'refresh_failed',
        'Zap session refresh requires a refresh token.',
      );
    }

    return this.refresh(session.refreshToken);
  }

  private refresh(refreshToken: string): Promise<ZapSession> {
    if (!this.refreshPromise) {
      this.refreshPromise = this.performRefresh(refreshToken).finally(() => {
        this.refreshPromise = null;
      });
    }

    return this.refreshPromise;
  }

  private async performRefresh(refreshToken: string): Promise<ZapSession> {
    if (!this.config.publishableKey) {
      throw new ZapLiveError(
        'not_configured',
        'Zap session refresh requires the Supabase publishable key.',
      );
    }

    const url = new URL(
      '/auth/v1/token?grant_type=refresh_token',
      `${this.config.apiBaseUrl.replace(/\/$/, '')}/`,
    );
    const headers = new Headers({
      accept: 'application/json',
      apikey: this.config.publishableKey,
      authorization: `Bearer ${this.config.publishableKey}`,
      'content-type': 'application/json',
      'x-client-info': 'zapkapow-comics-web',
    });

    let response: Response;

    try {
      response = await this.fetchImpl(url, {
        method: 'POST',
        headers,
        body: JSON.stringify({ refresh_token: refreshToken }),
      });
    } catch (error) {
      throw new ZapLiveError(
        'network_error',
        error instanceof Error ? error.message : 'Zap session refresh failed.',
      );
    }

    const body = await response.text();

    if (!response.ok) {
      const error = zapLiveHttpError(response.status, body);
      throw new ZapLiveError(
        'refresh_failed',
        `Zap session refresh failed: ${error.message}`,
        response.status,
      );
    }

    let payload: RefreshResponse;

    try {
      payload = JSON.parse(body) as RefreshResponse;
    } catch {
      throw new ZapLiveError(
        'refresh_failed',
        'Zap session refresh returned a non-JSON response.',
        response.status,
      );
    }

    if (
      typeof payload.access_token !== 'string' ||
      typeof payload.refresh_token !== 'string'
    ) {
      throw new ZapLiveError(
        'refresh_failed',
        'Zap session refresh returned no usable access/refresh token pair.',
        response.status,
      );
    }

    const jwtExpiry = accessTokenExpiresAt(payload.access_token);
    const expiresIn =
      typeof payload.expires_in === 'number' &&
      Number.isFinite(payload.expires_in)
        ? payload.expires_in
        : undefined;
    const session: ZapSession = {
      accessToken: payload.access_token,
      refreshToken: payload.refresh_token,
      expiresAt:
        jwtExpiry ??
        (expiresIn ? Math.floor(Date.now() / 1000) + expiresIn : undefined),
    };

    await this.sessionStore.save(session);
    return session;
  }

  private async request<T>(
    path: string,
    init: RequestInit = {},
    retried = false,
  ): Promise<T> {
    if (!this.config.publishableKey) {
      throw new ZapLiveError(
        'not_configured',
        'Zap live access requires the Supabase publishable key.',
      );
    }

    const session = await this.getSession();

    if (!session.accessToken) {
      throw new ZapLiveError(
        'session_expired',
        'Zap session did not provide an access token.',
      );
    }

    const url = new URL(path, `${this.config.apiBaseUrl.replace(/\/$/, '')}/`);
    const headers = new Headers(init.headers);

    if (!headers.has('accept')) headers.set('accept', 'application/json');
    headers.set('apikey', this.config.publishableKey);
    headers.set('authorization', `Bearer ${session.accessToken}`);
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

    if (response.status === 401 && !retried && session.refreshToken) {
      await this.getSession(true);
      return this.request(path, init, true);
    }

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

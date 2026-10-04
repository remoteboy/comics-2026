export interface ZapTitleSearchRow {
  id: number;
  name: string;
  slug: string;
  views: number;
  primary_issue_id: number | null;
}

export interface ZapIssueListRow {
  id: number;
  number: string;
  variant: string | null;
  key_issue: string | number | boolean;
  first_appearance_of: string | null;
  cover_url: string | null;
  cover_date: string | null;
  title_id: number;
  issue_type_id: number;
  story_title: string | null;
  publisher: string | null;
  cover_price: number | null;
  writer: string | null;
  penciller: string | null;
  cover_artist: string | null;
  inker: string | null;
  details: string | null;
  nm_price: number | null;
  total_issue_count: number;
  title_slug_out: string;
  issue_slug_out: string;
}

export interface ZapIssuesForTitleResponse {
  issues: ZapIssueListRow[];
  total_count: number;
}

export interface ZapHistoricalPriceRow {
  price: string | number;
  source: string | null;
  created_at: string | null;
  price_guides: {
    id: number;
    effective_date: string;
  } | null;
}

export interface ZapIssueDetail {
  id: number;
  number: string;
  variant: string | null;
  key_issue: string | number | boolean;
  first_appearance_of: string | null;
  cover_url: string | null;
  cover_date: string | null;
  title_id: number;
  issue_type_id: number;
  issue_type_name: string | null;
  story_title: string | null;
  publisher: string | null;
  cover_price: number | null;
  writer: string | null;
  penciller: string | null;
  cover_artist: string | null;
  inker: string | null;
  details: string | null;
  title_name: string;
  current_nm_price: number | null;
  previous_nm_price: number | null;
  current_price_effective_date: string | null;
  historical_prices: ZapHistoricalPriceRow[];
  title_slug_out: string;
  issue_slug_out: string;
}

export interface ZapIssuePriceRow {
  id: number;
  issue_id: number;
  price: number;
  price_guides: {
    effective_date: string;
  } | null;
  issues: {
    title_id: number;
  } | null;
}

export interface ZapIssueConditionRow {
  id: number;
  condition: number;
  percentage: number;
  description: string;
  abv: string | null;
}

export interface ZapGradedPriceRow {
  grade: string;
  price: number;
  source: string | null;
}

export interface ZapRecentPriceChangeRow {
  issue_id: number;
  issue_number: string;
  issue_variant: string | null;
  title_id: number;
  issue_type_id: number;
  title_name: string;
  cover_url: string | null;
  current_nm_price: number | null;
  previous_nm_price: number | null;
  price_change_date: string | null;
  issue_updated_at: string | null;
  issue_slug: string;
  title_slug: string;
  total_count: number;
}

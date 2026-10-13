import type {
  NormalizedIssueResult,
  NormalizedVariantResult,
  ProviderIssueType,
} from '@/providers/types';
import type { CopyValuationClient } from '@/features/collection/copy-valuation';
import type {
  ZapIssueDetail,
  ZapIssuesForTitleResponse,
  ZapTitleSearchRow,
} from '@/providers/zap/live';
export type IntakeSource = 'zap' | 'comic_vine' | 'manual';
export interface IntakeTitle {
  source: Exclude<IntakeSource, 'manual'>;
  externalId: string;
  name: string;
  slug: string;
  year: number | null;
  publisher: string | null;
}
export interface IntakeCover {
  externalId: string;
  slug: string;
  number: string;
  type: ProviderIssueType;
  label: string;
  imageUrl: string | null;
  imageKey?: string | null;
  metadata?: {
    issue: NormalizedIssueResult;
    variant: NormalizedVariantResult;
    publisher: string | null;
  };
}
export interface IntakeLookup {
  title: IntakeTitle;
  localSeriesId: number | null;
  issueNumber: string;
  issueType: ProviderIssueType;
  covers: IntakeCover[];
}
export interface IntakeZapClient extends CopyValuationClient {
  searchTitles(query: string, limit?: number): Promise<ZapTitleSearchRow[]>;
  issuesForTitle(options: {
    titleSlug: string;
    issueNumber: string;
    page: number;
    pageSize: number;
    issueTypeIds: number[];
  }): Promise<ZapIssuesForTitleResponse>;
  issueDetails(titleSlug: string, issueSlug: string): Promise<ZapIssueDetail>;
}

import { readFileSync } from 'node:fs';
import { providerFixture } from './provider-fixtures';
import type { IntakeTitle, IntakeZapClient } from '@/features/intake/types';
import type { IntakeInput } from '@/features/intake/save';
import type {
  ZapIssueConditionRow,
  ZapIssueDetail,
  ZapIssueListRow,
} from '@/providers/zap/live';
import { validateCover } from '@/covers/upload';
export const intakeTitle: IntakeTitle = {
  source: 'zap',
  externalId: '9900',
  name: 'New Collection (2026)',
  slug: 'new-collection-2026',
  year: 2026,
  publisher: null,
};
export function intakeDetail(
  overrides: Partial<ZapIssueDetail> = {},
): ZapIssueDetail {
  return {
    ...(providerFixture('zap-current-issue-detail.json') as ZapIssueDetail),
    id: 8000,
    title_id: 9900,
    title_name: intakeTitle.name,
    title_slug_out: intakeTitle.slug,
    issue_slug_out: '1-8000',
    number: '1',
    variant: 'Cover A',
    story_title: 'New story',
    publisher: 'DC Comics',
    writer: 'Jane Writer',
    cover_artist: 'New Cover Artist',
    cover_url: null,
    ...overrides,
  };
}
export function intakeRow(
  overrides: Partial<ZapIssueListRow> = {},
): ZapIssueListRow {
  return {
    ...intakeDetail(),
    nm_price: 15,
    total_issue_count: 2,
    ...overrides,
  } as ZapIssueListRow;
}
export function intakeClient(
  overrides: Partial<IntakeZapClient> = {},
): IntakeZapClient {
  return {
    async searchTitles() {
      return [
        {
          id: 9900,
          name: intakeTitle.name,
          slug: intakeTitle.slug,
          views: 0,
          primary_issue_id: null,
        },
      ];
    },
    async issuesForTitle() {
      return { issues: [intakeRow()], total_count: 1 };
    },
    async issueDetails() {
      return intakeDetail();
    },
    async issueConditions() {
      return providerFixture(
        'zap-current-conditions.json',
      ) as ZapIssueConditionRow[];
    },
    async latestRawPrice(id) {
      return {
        id: 1,
        issue_id: Number(id),
        price: 15,
        price_guides: null,
        issues: null,
      };
    },
    ...overrides,
  };
}
export function intakeInput(overrides: Partial<IntakeInput> = {}): IntakeInput {
  return {
    requestId: crypto.randomUUID(),
    lookupId: null,
    coverId: null,
    localSeriesId: null,
    titleName: 'Manual Title',
    titleYear: 2026,
    titleStatus: 'ongoing',
    number: '1',
    issueType: 'issue',
    gradeTenths: 94,
    quantity: 1,
    boxId: 1,
    purchasePriceCents: 900,
    purchaseDate: '2026-10-12',
    valueMode: 'manual',
    manualValueCents: 1000,
    manualMetadata: {
      requestId: 'manual-metadata-input',
      variantId: 1,
      expectedVersion: 0,
      variantName: 'Cover A',
      storyTitle: 'A manual story',
      firstAppearanceOf: 'Hero',
      details: 'Manual notes',
      publisherName: 'DC Comics',
      coverPriceCents: 399,
      credits: [{ name: 'Jane Writer', role: 'writer' }],
    },
    ...overrides,
  };
}
export async function intakePhoto() {
  return validateCover(
    new File(
      [readFileSync(new URL('../fixtures/covers/tiny.png', import.meta.url))],
      'cover.png',
    ),
  );
}

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  lookupMetadata,
  MetadataLookupError,
} from '@/features/collection/metadata-lookup';
import {
  getEditableMetadata,
  MetadataEditConflict,
  saveMetadata,
} from '@/features/collection/metadata-edit';
import { listVariantHoldings } from '@/features/collection/variant.repository';
import { listPriceHistory } from '@/features/valuation/repository';
import { ComicVineIntakeClient } from '@/features/intake/comic-vine';
import {
  createTestDatabase,
  type TestDatabase,
} from '../helpers/test-database';
import {
  intakeClient,
  intakeDetail,
  intakeRow,
} from '../helpers/intake-fixtures';
let db: TestDatabase;
beforeEach(async () => {
  db = createTestDatabase();
  await db.run(
    "UPDATE external_refs SET external_id='9900' WHERE entity_type='series' AND entity_id=1 AND provider='zap'",
  );
  await db.run(
    "UPDATE external_refs SET external_id='8000' WHERE entity_type='variant' AND entity_id=1 AND provider='zap'",
  );
});
afterEach(() => db.close());
describe('metadata suggestions', () => {
  it('returns a safe actionable failure for title lookup without leaking provider errors', async () => {
    await expect(
      lookupMetadata(1, 0, 'zap', db, {
        zap: intakeClient({
          async searchTitles() {
            throw new Error('private access-token');
          },
        }),
      }),
    ).rejects.toBeInstanceOf(MetadataLookupError);
    await expect(
      lookupMetadata(1, 0, 'zap', db, {
        zap: intakeClient({
          async searchTitles() {
            throw new Error('private access-token');
          },
        }),
      }),
    ).rejects.toThrow('Open Providers');
  });
  it('matches the exact Zap cover and stays read-only until reviewed details are saved', async () => {
    const before = await getEditableMetadata(1, db);
    const holdings = await listVariantHoldings(1, db);
    const history = await listPriceHistory(1, db);
    const suggestions = await lookupMetadata(1, 0, 'zap', db, {
      zap: intakeClient({
        async issueDetails() {
          return intakeDetail({ details: '<p>New &amp; readable</p>' });
        },
      }),
    });
    expect(suggestions.details).toBe('New & readable');
    expect(suggestions.credits).toContainEqual({
      name: 'Jane Writer',
      role: 'writer',
    });
    expect(suggestions.credits).toContainEqual({
      name: 'New Cover Artist',
      role: 'cover_artist',
    });
    expect(await getEditableMetadata(1, db)).toEqual(before);
    await saveMetadata(
      {
        requestId: crypto.randomUUID(),
        variantId: 1,
        expectedVersion: 0,
        variantName: before!.variantName,
        storyTitle: before!.storyTitle,
        firstAppearanceOf: before!.firstAppearanceOf,
        details: suggestions.details,
        publisherName: before!.publisherName,
        coverPriceCents: before!.coverPriceCents,
        credits: [...before!.credits, ...suggestions.credits],
      },
      undefined,
      db,
    );
    const saved = await getEditableMetadata(1, db);
    expect(saved?.credits).toContainEqual({
      name: 'Alex Artist',
      role: 'artist',
    });
    expect(
      saved?.credits.filter(
        (c) => c.name === 'Jane Writer' && c.role === 'writer',
      ),
    ).toHaveLength(1);
    expect(await listVariantHoldings(1, db)).toEqual(holdings);
    expect(await listPriceHistory(1, db)).toEqual(history);
  });
  it('resolves an old title name after a rename using the exact saved ID', async () => {
    await db.run(
      "INSERT INTO series_aliases(series_id,name,start_year) VALUES(1,'Old Title',2024)",
    );
    const search = vi.fn(async (query: string) =>
      query === 'Old Title'
        ? [
            {
              id: 9900,
              name: 'Old Title',
              slug: 'new-collection-2026',
              views: 0,
              primary_issue_id: null,
            },
          ]
        : [],
    );
    await lookupMetadata(1, 0, 'zap', db, {
      zap: intakeClient({ searchTitles: search }),
    });
    expect(search).toHaveBeenCalledWith('Old Title', 30);
  });
  it('refuses wrong cover details, missing exact covers and ambiguous mappings', async () => {
    await expect(
      lookupMetadata(1, 0, 'zap', db, {
        zap: intakeClient({
          async issueDetails() {
            return intakeDetail({ id: 8001 });
          },
        }),
      }),
    ).rejects.toThrow('no longer matches');
    await expect(
      lookupMetadata(1, 0, 'zap', db, {
        zap: intakeClient({
          async issuesForTitle() {
            return { issues: [intakeRow({ id: 8001 })], total_count: 1 };
          },
        }),
      }),
    ).rejects.toThrow('exact cover');
    await db.run(
      "INSERT INTO external_refs(entity_type,entity_id,provider,external_id) VALUES('variant',1,'zap','8002')",
    );
    await expect(
      lookupMetadata(1, 0, 'zap', db, { zap: intakeClient() }),
    ).rejects.toThrow('unambiguous');
  });
  it('rejects stale suggestions before and after a provider request', async () => {
    await expect(
      lookupMetadata(1, 1, 'zap', db, { zap: intakeClient() }),
    ).rejects.toBeInstanceOf(MetadataEditConflict);
    await expect(
      lookupMetadata(1, 0, 'zap', db, {
        zap: intakeClient({
          async issueDetails() {
            await db.run('UPDATE variants SET edit_version=1 WHERE id=1');
            return intakeDetail();
          },
        }),
      }),
    ).rejects.toBeInstanceOf(MetadataEditConflict);
  });
  it('leaves metadata unchanged after a failed provider lookup', async () => {
    const before = await getEditableMetadata(1, db);
    await expect(
      lookupMetadata(1, 0, 'zap', db, {
        zap: intakeClient({
          async issueDetails() {
            throw new Error('Offline');
          },
        }),
      }),
    ).rejects.toThrow('could not load');
    expect(await getEditableMetadata(1, db)).toEqual(before);
  });
  it('fetches Comic Vine issue notes without assigning issue-level cover artists to an alternate cover', async () => {
    const fetcher = vi.fn(async () =>
      Response.json({
        status_code: 1,
        results: {
          id: 9001,
          issue_number: '1',
          volume: { id: 777 },
          name: 'Story',
          description: '<p>Provider notes</p>',
          person_credits: [
            { id: 1, name: 'Jane Writer', role: 'writer' },
            { id: 2, name: 'Unverified Cover Artist', role: 'cover' },
          ],
        },
      }),
    ) as typeof fetch;
    const client = new ComicVineIntakeClient('test-key', fetcher);
    const result = await lookupMetadata(1, 0, 'comic_vine', db, {
      comicVine: client,
    });
    expect(result.details).toBe('Provider notes');
    expect(result.credits).toEqual([{ name: 'Jane Writer', role: 'writer' }]);
    expect(String(vi.mocked(fetcher).mock.calls[0][0])).toContain(
      '/api/issue/4000-9001/',
    );
  });
  it('checks Comic Vine response identity independently of the saved synthetic cover index', async () => {
    const client = new ComicVineIntakeClient(
      'test-key',
      vi.fn(async () =>
        Response.json({
          status_code: 1,
          results: { id: 9999, issue_number: '1', volume: { id: 777 } },
        }),
      ) as typeof fetch,
    );
    await expect(
      lookupMetadata(1, 0, 'comic_vine', db, { comicVine: client }),
    ).rejects.toThrow('different issue');
  });
});

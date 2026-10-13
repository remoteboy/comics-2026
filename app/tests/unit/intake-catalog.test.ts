import { providerFixture } from '../helpers/provider-fixtures';
import { describe, expect, it, vi } from 'vitest';
import {
  discoverZapCovers,
  searchZapTitles,
  zapCoverMetadata,
} from '@/features/intake/catalog';
import {
  ComicVineIntakeClient,
  comicVineGallery,
} from '@/features/intake/comic-vine';
import {
  safeProviderImage,
  downloadProviderCover,
} from '@/features/intake/images';
import { intakeFromForm, nextIssueNumber } from '@/features/intake/form';
import {
  intakeClient,
  intakeDetail,
  intakeRow,
  intakeTitle,
  intakePhoto,
} from '../helpers/intake-fixtures';
import type { IntakeLookup } from '@/features/intake/types';

describe('intake discovery and form boundaries', () => {
  it('searches by title name and retains provider identity/year', async () => {
    expect(await searchZapTitles('New Collection', intakeClient())).toEqual([
      intakeTitle,
    ]);
  });
  it('collects every page and filters exact number/type rather than fuzzy results', async () => {
    const requests: number[] = [];
    const covers = await discoverZapCovers(
      intakeTitle,
      '1',
      'issue',
      intakeClient({
        async issuesForTitle(options) {
          requests.push(options.page);
          return options.page === 1
            ? {
                issues: [
                  intakeRow(),
                  intakeRow({
                    id: 8001,
                    number: '11',
                    issue_slug_out: '11-8001',
                  }),
                ],
                total_count: 3,
              }
            : {
                issues: [
                  intakeRow({
                    id: 8002,
                    cover_url:
                      'https://club.zapkapowcomics.com/image.php?id=8002',
                    variant: 'Cover B',
                    issue_slug_out: '1-8002',
                  }),
                ],
                total_count: 3,
              };
        },
      }),
    );
    expect(requests).toEqual([1, 2]);
    expect(covers.map((cover) => cover.externalId)).toEqual(['8000', '8002']);
    expect(covers[0].imageUrl).toBe(
      'https://zkc-club-covers.s3.us-east-1.amazonaws.com/8000.jpg',
    );
    expect(covers[1].imageUrl).toBe(
      'https://zkc-club-covers.s3.us-east-1.amazonaws.com/8002.jpg',
    );
  });
  it('requests annuals separately and verifies the selected detail type', async () => {
    const client = intakeClient({
      async issuesForTitle(options) {
        expect(options.issueTypeIds).toEqual([2]);
        return { issues: [intakeRow({ issue_type_id: 2 })], total_count: 1 };
      },
      async issueDetails() {
        return intakeDetail({ issue_type_id: 2, issue_type_name: 'Annual' });
      },
    });
    const covers = await discoverZapCovers(intakeTitle, '1', 'annual', client);
    const lookup: IntakeLookup = {
      title: intakeTitle,
      localSeriesId: null,
      issueNumber: '1',
      issueType: 'annual',
      covers,
    };
    expect((await zapCoverMetadata(lookup, covers[0], client)).issue.type).toBe(
      'annual',
    );
    await expect(
      zapCoverMetadata(lookup, covers[0], intakeClient()),
    ).rejects.toThrow('no longer matches');
  });
  it('rejects repeated, incomplete, changing and foreign-title results', async () => {
    for (const client of [
      intakeClient({
        async issuesForTitle() {
          return { issues: [intakeRow()], total_count: 3 };
        },
      }),
      intakeClient({
        async issuesForTitle(options) {
          return {
            issues: options.page === 1 ? [intakeRow()] : [],
            total_count: 2,
          };
        },
      }),
      intakeClient({
        async issuesForTitle(options) {
          return {
            issues: [intakeRow({ id: 8000 + options.page })],
            total_count: options.page === 1 ? 3 : 2,
          };
        },
      }),
      intakeClient({
        async issuesForTitle() {
          return { issues: [intakeRow({ title_id: 999 })], total_count: 1 };
        },
      }),
    ])
      await expect(
        discoverZapCovers(intakeTitle, '1', 'issue', client),
      ).rejects.toThrow();
  });
  it('does not return partial results if a later provider page fails', async () => {
    await expect(
      discoverZapCovers(
        intakeTitle,
        '1',
        'issue',
        intakeClient({
          async issuesForTitle(options) {
            if (options.page === 2) throw Error('offline');
            return { issues: [intakeRow()], total_count: 2 };
          },
        }),
      ),
    ).rejects.toThrow('before all pages');
  });
  it('checks the exact selected cover and issue identity before saving', async () => {
    const covers = await discoverZapCovers(
      intakeTitle,
      '1',
      'issue',
      intakeClient(),
    );
    const lookup: IntakeLookup = {
      title: intakeTitle,
      localSeriesId: null,
      issueNumber: '1',
      issueType: 'issue',
      covers,
    };
    for (const change of [
      { id: 8001 },
      { number: '11' },
      { title_id: 22 },
      { title_slug_out: 'other' },
      { issue_slug_out: 'other' },
    ])
      await expect(
        zapCoverMetadata(
          lookup,
          covers[0],
          intakeClient({
            async issueDetails() {
              return intakeDetail(change);
            },
          }),
        ),
      ).rejects.toThrow('no longer matches');
  });
  it('keeps Comic Vine cover indices and lazy image/name association from the old gallery', () => {
    const html =
      '<div class="issue-cover"><img src="https://comicvine1.cbsistatic.com/a.jpg"></div><div class="issue-cover"><img src="blank" data-src="https://comicvine1.cbsistatic.com/b.jpg"></div><h4>List of covers and their creators:</h4><table><tr><td>A</td><td>Cover A</td><td>Artist</td><td>1</td></tr><tr><td>B</td><td>Cover B &amp; Gold</td><td>Artist</td><td>2</td></tr></table>';
    expect(comicVineGallery(html, '4000-123')).toEqual([
      {
        externalId: '4000-123-0',
        label: 'Cover A',
        imageUrl: 'https://comicvine1.cbsistatic.com/a.jpg',
      },
      {
        externalId: '4000-123-1',
        label: 'Cover B & Gold',
        imageUrl: 'https://comicvine1.cbsistatic.com/b.jpg',
      },
    ]);
    expect(() =>
      comicVineGallery('<html>Challenge</html>', '4000-123'),
    ).toThrow('unavailable');
  });
  it('discovers every Comic Vine gallery cover and carries its API metadata', async () => {
    const fixture = providerFixture('comic-vine-cover-b.json') as {
      response: Record<string, any>;
      details: string;
      image: string;
    };
    const issue = fixture.response;
    const volume = {
      id: issue.volume.id,
      name: issue.volume.name,
      start_year: '2019',
      publisher: { name: 'Image Comics' },
      count_of_issues: 1,
      issues: [{ id: issue.id, issue_number: issue.issue_number }],
    };
    const html = `<div class="issue-cover"><img src="${issue.image.super_url}"></div><div class="issue-cover"><img data-src="${fixture.image}"></div>${fixture.details}`;
    const fetcher = vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(String(input));
      if (url.pathname === '/api/search/')
        return Response.json({ status_code: 1, results: [volume] });
      if (url.pathname.startsWith('/api/volume/'))
        return Response.json({ status_code: 1, results: volume });
      if (url.pathname.startsWith('/api/issue/'))
        return Response.json({ status_code: 1, results: issue });
      return new Response(html);
    }) as typeof fetch;
    const client = new ComicVineIntakeClient('fixture-key', fetcher);
    const [title] = await client.searchTitles('Undiscovered Country');
    const covers = await client.discoverCovers(title, '6', 'issue');
    expect(covers.map((cover) => cover.externalId)).toEqual([
      '4000-767904-0',
      '4000-767904-1',
    ]);
    expect(covers[1].label).toBe('Cover B');
    expect(covers[1].metadata?.publisher).toBe('Image Comics');
    expect(covers[1].metadata?.issue.description).not.toContain('<p>');
    expect(covers[1].metadata?.variant.creators.length).toBeGreaterThan(0);
  });

  it('redacts Comic Vine credentials from lookup failures', async () => {
    const client = new ComicVineIntakeClient(
      'private-key',
      vi.fn(async () => {
        throw Error('https://api?api_key=private-key');
      }) as typeof fetch,
    );
    await expect(client.searchTitles('Example')).rejects.toThrow(
      'lookup is unavailable',
    );
    try {
      await client.searchTitles('Example');
    } catch (cause) {
      expect(String(cause)).not.toContain('private-key');
    }
  });
  it('only downloads approved HTTPS images with bounded bytes and no redirects', async () => {
    expect(
      safeProviderImage(
        'https://zkc-club-covers.s3.us-east-1.amazonaws.com/416098.jpg',
      ),
    ).not.toBeNull();
    expect(
      safeProviderImage('https://comics.zapkapowcomics.com/image.php?id=8000'),
    ).toBe('https://comics.zapkapowcomics.com/image.php?id=8000');
    expect(
      safeProviderImage(
        'https://s3.amazonaws.com/comicgeeks/comics/covers/a.jpg',
      ),
    ).not.toBeNull();
    expect(
      safeProviderImage('https://s3.amazonaws.com/other/a.jpg'),
    ).toBeNull();
    for (const url of [
      'http://comicvine1.cbsistatic.com/a.jpg',
      'https://127.0.0.1/a.jpg',
      'https://comicvine1.cbsistatic.com.evil.test/a.jpg',
      'https://user:pass@comicvine1.cbsistatic.com/a.jpg',
    ])
      expect(safeProviderImage(url)).toBeNull();
    const photo = await intakePhoto();
    const fetcher = vi.fn(async (_url, options) => {
      expect(options?.redirect).toBe('error');
      return new Response(Uint8Array.from(photo.bytes));
    }) as typeof fetch;
    expect(
      (
        await downloadProviderCover(
          'https://comicvine1.cbsistatic.com/a.png',
          fetcher,
        )
      ).extension,
    ).toBe('png');
    await expect(
      downloadProviderCover(
        'https://comicvine1.cbsistatic.com/a.png',
        vi.fn(
          async () =>
            new Response('x', {
              headers: { 'content-length': String(6 * 1024 * 1024) },
            }),
        ) as typeof fetch,
      ),
    ).rejects.toThrow('large');
  });
  it('parses purchases, leap-day dates and manual zero without coercing prices', () => {
    const form = new FormData();
    for (const [name, value] of Object.entries({
      requestId: crypto.randomUUID(),
      lookupId: '',
      coverId: '',
      localSeriesId: '',
      titleName: 'Manual',
      titleYear: '2026',
      titleStatus: 'ongoing',
      number: '1/2',
      issueType: 'issue',
      grade: '9.4',
      quantity: '2',
      boxId: '1',
      purchasePrice: '9.00',
      purchaseDate: '2024-02-29',
      valueMode: 'manual',
      manualValue: '0',
      expectedVersion: '0',
      variantName: 'Cover B',
      storyTitle: '',
      firstAppearanceOf: '',
      details: '',
      publisherName: '',
      coverPrice: '',
    }))
      form.set(name, value);
    expect(intakeFromForm(form)).toMatchObject({
      quantity: 2,
      purchasePriceCents: 900,
      purchaseDate: '2024-02-29',
      manualValueCents: 0,
    });
    form.set('purchasePrice', '9.999');
    expect(() => intakeFromForm(form)).toThrow();
    expect(nextIssueNumber('99')).toBe('100');
    for (const number of ['1/2', '12.1', '1A'])
      expect(nextIssueNumber(number)).toBe('');
  });
});

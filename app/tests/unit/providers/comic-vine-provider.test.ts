import { describe, expect, it } from 'vitest';

import { RecordedComicVineProvider } from '@/providers/comic-vine/provider';
import { providerFixture } from '../../helpers/provider-fixtures';

const provider = new RecordedComicVineProvider();
const coverB = providerFixture('comic-vine-cover-b.json');

describe('RecordedComicVineProvider', () => {
  it('normalizes the series reference preserved by the issue API payload', () => {
    expect(provider.normalizeSeries(coverB)).toEqual({
      provider: 'comic_vine',
      externalId: '4050-122630',
      name: 'Undiscovered Country',
      startYear: null,
      publisher: null,
    });
  });

  it('normalizes issue metadata without keeping the scraped cover table in the description', () => {
    const issue = provider.normalizeIssue(coverB);

    expect(issue).toMatchObject({
      externalId: '4000-767904',
      seriesExternalId: '4050-122630',
      number: '6',
      storyTitle: 'Destiny, Part Six',
      coverDate: '2020-06-13',
      releaseDate: '2020-06-10',
    });
    expect(issue?.description).not.toContain(
      'List of covers and their creators',
    );
    expect(issue?.images?.original).toContain('7418771-06a.jpg');
  });

  it('preserves the legacy synthetic cover index and exact scraped cover image', () => {
    expect(provider.normalizeVariants(coverB)).toEqual([
      expect.objectContaining({
        externalId: '4000-767904-1',
        issueExternalId: '4000-767904',
        coverIndex: 1,
        label: 'Cover B',
        imageUrl:
          'https://comicvine1.cbsistatic.com/uploads/scale_large/6/67663/7418789-06b.jpg',
      }),
    ]);
  });

  it('normalizes Comic Vine person roles including cover aliases', () => {
    const creators = provider.normalizeIssue(coverB)?.creators ?? [];

    expect(creators).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          externalId: '4040-60772',
          name: 'Charles Soule',
          roles: ['writer'],
        }),
        expect.objectContaining({
          externalId: '4040-41882',
          name: 'Giuseppe Camuncoli',
          roles: ['artist', 'cover_artist'],
        }),
        expect.objectContaining({
          externalId: '4040-43937',
          name: 'Sean Gordon Murphy',
          roles: ['cover_artist'],
        }),
      ]),
    );
  });

  it('does not invent pricing or update support that Comic Vine never supplied', () => {
    expect(provider.normalizeValuations(coverB)).toEqual([]);
    expect(provider.normalizeUpdates(coverB)).toEqual([]);
  });

  it('demonstrates why API-only Comic Vine data cannot discover alternate covers', () => {
    const issue = provider.normalizeIssue(coverB);
    const [variant] = provider.normalizeVariants(coverB);

    expect(issue?.images?.original).toContain('06a.jpg');
    expect(variant.imageUrl).toContain('06b.jpg');
    expect(variant.coverIndex).toBe(1);
  });
});

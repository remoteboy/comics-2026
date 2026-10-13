import { runtimeEnvironment } from '@/platform/runtime-env';
import {
  normalizeComicVineIssue,
  normalizeComicVineVariants,
} from '@/providers/comic-vine/catalog';
import type { ProviderIssueType } from '@/providers/types';
import { IntakeLookupError, issueNumber } from './catalog';
import type { IntakeCover, IntakeTitle } from './types';

function text(value: string): string {
  return value
    .replace(/<[^>]*>/g, ' ')
    .replace(
      /&(?:amp|quot|apos|lt|gt|nbsp);/g,
      (entity) =>
        ({
          '&amp;': '&',
          '&quot;': '"',
          '&apos;': "'",
          '&lt;': '<',
          '&gt;': '>',
          '&nbsp;': ' ',
        })[entity] ?? entity,
    )
    .replace(/&#(x[0-9a-f]+|\d+);/gi, (_, code: string) => {
      const n =
        code[0].toLowerCase() === 'x'
          ? parseInt(code.slice(1), 16)
          : Number(code);
      return n > 0 && n <= 0x10ffff ? String.fromCodePoint(n) : '';
    })
    .replace(/\s+/g, ' ')
    .trim();
}
function attribute(tag: string, name: string): string | null {
  const match = tag.match(
    new RegExp(
      `(?:^|\\s)${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`,
      'i',
    ),
  );
  return match ? text(match[1] ?? match[2] ?? match[3]) : null;
}
export function comicVineGallery(
  html: string,
  issueId: string,
): { externalId: string; label: string; imageUrl: string }[] {
  const images = [
    ...html.matchAll(
      /<div\b[^>]*class=["'][^"']*\bissue-cover\b[^"']*["'][^>]*>\s*(<img\b[^>]*>)/gi,
    ),
  ].map((match) => {
    const src = attribute(match[1], 'src');
    return src?.startsWith('https://') ? src : attribute(match[1], 'data-src');
  });
  if (!images.length || images.some((image) => !image?.startsWith('https://')))
    throw new IntakeLookupError(
      'Comic Vine cover gallery is unavailable or incomplete. Retry or use manual entry with your cover image.',
    );
  const labels = new Map<number, string>();
  const table = html.match(
    /<h4[^>]*>\s*List of covers and their creators:\s*<\/h4>\s*(<table\b[\s\S]*?<\/table>)/i,
  )?.[1];
  if (table)
    for (const row of table.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)) {
      const cells = [...row[1].matchAll(/<td\b[^>]*>([\s\S]*?)<\/td>/gi)].map(
        (match) => text(match[1]),
      );
      const index = Number(cells[3]);
      if (cells.length >= 4 && Number.isInteger(index) && index > 0 && cells[1])
        labels.set(index, cells[1]);
    }
  if ([...labels.keys()].some((index) => index > images.length))
    throw new IntakeLookupError(
      'Comic Vine cover labels and images do not agree. Retry or use manual entry.',
    );
  return images.map((image, index) => ({
    externalId: `${issueId}-${index}`,
    label:
      labels.get(index + 1) ??
      (index === 0 ? 'Regular cover' : `Cover ${index + 1}`),
    imageUrl: image!,
  }));
}

export class ComicVineIntakeClient {
  constructor(
    private readonly apiKey = runtimeEnvironment().COMIC_VINE_API_KEY,
    private readonly fetchImpl: typeof fetch = globalThis.fetch,
  ) {}
  private async api(
    path: string,
    parameters: Record<string, string> = {},
  ): Promise<Record<string, any>> {
    if (!this.apiKey)
      throw new IntakeLookupError(
        'Comic Vine is not configured. Use Zap or manual entry.',
      );
    const url = new URL(path, 'https://comicvine.gamespot.com');
    url.searchParams.set('format', 'json');
    url.searchParams.set('api_key', this.apiKey);
    for (const [name, value] of Object.entries(parameters))
      url.searchParams.set(name, value);
    try {
      const response = await this.fetchImpl(url, {
        headers: {
          'User-Agent': 'ComicsCollection/1.0',
          Accept: 'application/json',
        },
        redirect: 'error',
        signal: AbortSignal.timeout(20000),
      });
      if (!response.ok) throw new Error('Provider request failed.');
      const body = await readProviderBody(response, 8 * 1024 * 1024);
      const payload = JSON.parse(body);
      if (!payload || payload.status_code !== 1 || !payload.results)
        throw new Error('Invalid provider response.');
      return payload;
    } catch (cause) {
      if (cause instanceof IntakeLookupError) throw cause;
      throw new IntakeLookupError(
        'Comic Vine lookup is unavailable. Retry, use Zap or enter the comic manually.',
      );
    }
  }
  async searchTitles(query: string): Promise<IntakeTitle[]> {
    if (query.trim().length < 2 || query.length > 200)
      throw new IntakeLookupError(
        'Enter at least two characters of the title name.',
      );
    const response = await this.api('/api/search/', {
      query: query.trim(),
      resources: 'volume',
      limit: '30',
      field_list: 'id,name,start_year,publisher',
    });
    if (!Array.isArray(response.results))
      throw new IntakeLookupError('Comic Vine returned an invalid title list.');
    return response.results.flatMap((row: any) =>
      Number.isSafeInteger(row.id) && row.id > 0 && typeof row.name === 'string'
        ? [
            {
              source: 'comic_vine' as const,
              externalId: `4050-${row.id}`,
              slug: `4050-${row.id}`,
              name: row.name,
              year: /^\d{4}$/.test(String(row.start_year))
                ? Number(row.start_year)
                : null,
              publisher:
                typeof row.publisher?.name === 'string'
                  ? row.publisher.name
                  : null,
            },
          ]
        : [],
    );
  }
  async discoverCovers(
    title: IntakeTitle,
    number: string,
    type: ProviderIssueType,
  ): Promise<IntakeCover[]> {
    if (!/^4050-\d+$/.test(title.externalId))
      throw new IntakeLookupError('Choose a valid Comic Vine title.');
    const requested = issueNumber(number);
    const volume = await this.api(`/api/volume/${title.externalId}/`);
    if (String(volume.results.id) !== title.externalId.slice(5))
      throw new IntakeLookupError('Comic Vine returned a different title.');
    const rows = volume.results.issues;
    if (!Array.isArray(rows))
      throw new IntakeLookupError('Comic Vine did not return its issue index.');
    if (
      typeof volume.results.count_of_issues === 'number' &&
      rows.length < volume.results.count_of_issues
    )
      throw new IntakeLookupError(
        'Comic Vine returned an incomplete issue index. Retry or use manual entry.',
      );
    const matches = rows.filter(
      (row: any) =>
        typeof row.issue_number === 'string' &&
        row.issue_number.trim().toLocaleLowerCase() ===
          requested.toLocaleLowerCase(),
    );
    const covers: IntakeCover[] = [];
    for (const row of matches) {
      if (!Number.isSafeInteger(row.id) || row.id < 1)
        throw new IntakeLookupError(
          'Comic Vine returned an invalid issue identity.',
        );
      const externalId = `4000-${row.id}`;
      const response = await this.api(`/api/issue/${externalId}/`);
      const detail = response.results;
      if (
        String(detail.id) !== String(row.id) ||
        String(detail.volume?.id) !== title.externalId.slice(5) ||
        String(detail.issue_number).trim().toLocaleLowerCase() !==
          requested.toLocaleLowerCase()
      )
        throw new IntakeLookupError(
          'Comic Vine returned an issue from a different title or number.',
        );
      const site = new URL(detail.site_detail_url);
      if (
        site.protocol !== 'https:' ||
        site.hostname !== 'comicvine.gamespot.com' ||
        site.username ||
        site.password ||
        site.port
      )
        throw new IntakeLookupError(
          'Comic Vine returned an unusable cover gallery address.',
        );
      let html: string;
      try {
        const page = await this.fetchImpl(site, {
          redirect: 'error',
          headers: { 'User-Agent': 'ComicsCollection/1.0' },
          signal: AbortSignal.timeout(20000),
        });
        if (!page.ok) throw Error('Unavailable');
        html = await readProviderBody(page, 8 * 1024 * 1024);
      } catch {
        throw new IntakeLookupError(
          'Comic Vine cover gallery is unavailable. Retry or use manual entry.',
        );
      }
      for (const gallery of comicVineGallery(html, externalId)) {
        const wrapper = {
          response: detail,
          remote_id: gallery.externalId,
          variant: gallery.label,
          image: gallery.imageUrl,
          type,
        };
        const issue = normalizeComicVineIssue(wrapper);
        const variant = normalizeComicVineVariants(wrapper)[0];
        if (!issue || !variant)
          throw new IntakeLookupError(
            'Comic Vine cover details could not be read.',
          );
        // Description HTML is treated as plain text in the collection, never rendered as markup.
        issue.description = issue.description ? text(issue.description) : null;
        covers.push({
          ...gallery,
          slug: externalId,
          number: issue.number,
          type,
          metadata: {
            issue,
            variant,
            publisher:
              title.publisher ?? volume.results.publisher?.name ?? null,
          },
        });
      }
    }
    return covers;
  }
}
export async function readProviderBody(
  response: Response,
  limit: number,
): Promise<string> {
  const reader = response.body?.getReader();
  if (!reader)
    throw new IntakeLookupError('Provider returned an empty response.');
  const decoder = new TextDecoder();
  let output = '',
    size = 0;
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > limit) {
        await reader.cancel();
        throw new IntakeLookupError('Provider response is too large.');
      }
      output += decoder.decode(value, { stream: true });
    }
    return output + decoder.decode();
  } finally {
    reader.releaseLock();
  }
}

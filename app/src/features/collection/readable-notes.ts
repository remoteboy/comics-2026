import { nonEmptyString } from '@/providers/utils';

// Return text, which Astro escapes. Provider and legacy HTML is never trusted markup.
export function readableNotes(value: string | null | undefined): string | null {
  const source = nonEmptyString(value);
  if (!source) return null;
  const entities: Record<string, string> = {
    amp: '&',
    lt: '<',
    gt: '>',
    quot: '"',
    apos: "'",
    nbsp: ' ',
    ndash: '–',
    mdash: '—',
    hellip: '…',
    lsquo: '‘',
    rsquo: '’',
    ldquo: '“',
    rdquo: '”',
    bull: '•',
    copy: '©',
    reg: '®',
  };
  const text = source
    .replace(/<!--(?:[\s\S]*?-->|[\s\S]*$)/g, '')
    .replace(
      /<(script|style|iframe|object)\b[^>]*>[\s\S]*?(?:<\/\1\s*>|$)/gi,
      '',
    )
    .replace(/<br\b[^>]*\/?\s*>/gi, '\n')
    .replace(/<li\b[^>]*>/gi, '\n• ')
    .replace(/<\/?(?:p|div|h[1-6]|ul|ol|li|tr|blockquote)\b[^>]*>/gi, '\n')
    .replace(/<\/?(?:td|th)\b[^>]*>/gi, ' ')
    .replace(/<\/?[a-z][^>]*>/gi, '')
    .replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (whole, entity: string) => {
      if (!entity.startsWith('#'))
        return entities[entity.toLowerCase()] ?? whole;
      const code =
        entity[1].toLowerCase() === 'x'
          ? parseInt(entity.slice(2), 16)
          : Number(entity.slice(1));
      return code > 0 && code <= 0x10ffff && !(code >= 0xd800 && code <= 0xdfff)
        ? String.fromCodePoint(code)
        : '';
    })
    .replace(/\r\n?/g, '\n')
    .replace(/[^\S\n]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  return text || null;
}

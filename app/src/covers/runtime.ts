import { readFile } from 'node:fs/promises';
import { extname, relative, resolve } from 'node:path';

import { runtimeConfig } from '@/config/runtime';
import { coverPlaceholder } from '@/covers/placeholder';

const contentTypes: Record<string, string> = {
  '.gif': 'image/gif',
  '.jpeg': 'image/jpeg',
  '.jpg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
};

function coverPath(root: string, key: string): string | undefined {
  const normalizedRoot = resolve(root);
  const path = resolve(normalizedRoot, key);
  const relation = relative(normalizedRoot, path);

  if (relation.startsWith('..') || relation.includes('/../')) return undefined;
  return path;
}

export async function coverResponse(key?: string): Promise<Response> {
  const root = runtimeConfig().legacyImageRoot;
  if (!key || !root || !/^[a-zA-Z0-9._-]+$/.test(key)) {
    return coverPlaceholder();
  }

  const path = coverPath(root, key);
  if (!path) return coverPlaceholder();

  try {
    const body = await readFile(path);
    return new Response(body, {
      headers: {
        'Cache-Control': 'public, max-age=3600',
        'Content-Type':
          contentTypes[extname(key).toLowerCase()] ??
          'application/octet-stream',
      },
    });
  } catch {
    return coverPlaceholder();
  }
}

import { readFile } from 'node:fs/promises';
import { extname, relative, resolve } from 'node:path';

import type { APIRoute } from 'astro';

import { runtimeConfig } from '@/config/runtime';

const contentTypes: Record<string, string> = {
  '.gif': 'image/gif',
  '.jpeg': 'image/jpeg',
  '.jpg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
};

function placeholder(): Response {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="600" viewBox="0 0 400 600"><rect width="400" height="600" fill="#18181b"/><path d="M120 245h160v110H120z" fill="#27272a"/><path d="m145 330 45-45 35 35 25-25 25 35H145z" fill="#52525b"/><circle cx="245" cy="275" r="14" fill="#71717a"/><text x="200" y="390" fill="#71717a" font-family="system-ui,sans-serif" font-size="18" text-anchor="middle">Cover unavailable</text></svg>`;

  return new Response(svg, {
    headers: {
      'Cache-Control': 'no-store',
      'Content-Type': 'image/svg+xml',
    },
  });
}

function coverPath(root: string, key: string): string | undefined {
  const normalizedRoot = resolve(root);
  const path = resolve(normalizedRoot, key);
  const relation = relative(normalizedRoot, path);

  if (relation.startsWith('..') || relation.includes('/../')) return undefined;

  return path;
}

export const GET: APIRoute = async ({ params }) => {
  const key = params.key;
  const root = runtimeConfig().legacyImageRoot;

  if (!key || !root || !/^[a-zA-Z0-9._-]+$/.test(key)) return placeholder();

  const path = coverPath(root, key);
  if (!path) return placeholder();

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
    return placeholder();
  }
};

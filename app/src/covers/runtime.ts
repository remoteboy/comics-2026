import { mkdir, unlink, writeFile, readFile } from 'node:fs/promises';
import { extname, relative, resolve } from 'node:path';

import { runtimeConfig } from '@/config/runtime';
import type { CoverStorage } from './upload';
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
  const root = key?.startsWith('uploaded-')
    ? runtimeConfig().coverUploadRoot
    : runtimeConfig().legacyImageRoot;
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
        'X-Content-Type-Options': 'nosniff',
        'Content-Type':
          contentTypes[extname(key).toLowerCase()] ??
          'application/octet-stream',
      },
    });
  } catch {
    return coverPlaceholder();
  }
}

export const coverStorage: CoverStorage = {
  async put(key, cover) {
    if (!/^uploaded-[a-zA-Z0-9-]+\.(jpg|png|webp|gif)$/.test(key))
      throw new Error('Invalid upload key.');
    const root = runtimeConfig().coverUploadRoot;
    await mkdir(root, { recursive: true });
    await writeFile(resolve(root, key), cover.bytes, { flag: 'wx' });
  },
  async remove(key) {
    if (!/^uploaded-[a-zA-Z0-9-]+\.(jpg|png|webp|gif)$/.test(key))
      throw new Error('Invalid upload key.');
    await unlink(resolve(runtimeConfig().coverUploadRoot, key)).catch(
      (cause: NodeJS.ErrnoException) => {
        if (cause.code !== 'ENOENT') throw cause;
      },
    );
  },
};

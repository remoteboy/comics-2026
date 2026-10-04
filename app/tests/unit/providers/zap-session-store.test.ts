import { mkdtemp, readFile, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { FileZapSessionStore } from '@/providers/zap/live/file-session-store';

describe('FileZapSessionStore', () => {
  it('uses the configured seed until a rotated session is persisted', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'comics-zap-session-'));
    const path = join(directory, 'session.json');
    const store = new FileZapSessionStore(path, {
      accessToken: 'seed-access',
      refreshToken: 'seed-refresh',
      expiresAt: 100,
    });

    await expect(store.load()).resolves.toMatchObject({
      accessToken: 'seed-access',
      refreshToken: 'seed-refresh',
    });

    await store.save({
      accessToken: 'rotated-access',
      refreshToken: 'rotated-refresh',
      expiresAt: 200,
    });

    await expect(store.load()).resolves.toEqual({
      accessToken: 'rotated-access',
      refreshToken: 'rotated-refresh',
      expiresAt: 200,
    });
    expect(JSON.parse(await readFile(path, 'utf8'))).toMatchObject({
      access_token: 'rotated-access',
      refresh_token: 'rotated-refresh',
      expires_at: 200,
    });
    expect((await stat(path)).mode & 0o777).toBe(0o600);
  });
});

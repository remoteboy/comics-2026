import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';

import type { ZapSession, ZapSessionStore } from './types';

const DEFAULT_SESSION_PATH = join(
  homedir(),
  '.config',
  'comics-collection',
  'zap-session.json',
);

interface StoredSession {
  access_token?: unknown;
  refresh_token?: unknown;
  expires_at?: unknown;
}

function parseSession(raw: string): ZapSession | null {
  try {
    const stored = JSON.parse(raw) as StoredSession;
    const accessToken =
      typeof stored.access_token === 'string' ? stored.access_token : undefined;
    const refreshToken =
      typeof stored.refresh_token === 'string'
        ? stored.refresh_token
        : undefined;
    const expiresAt =
      typeof stored.expires_at === 'number' &&
      Number.isFinite(stored.expires_at)
        ? stored.expires_at
        : undefined;

    return accessToken || refreshToken
      ? { accessToken, refreshToken, expiresAt }
      : null;
  } catch {
    return null;
  }
}

export function zapSessionPath(override?: string): string {
  return override?.trim() || DEFAULT_SESSION_PATH;
}

export class FileZapSessionStore implements ZapSessionStore {
  readonly path: string;

  constructor(
    path?: string,
    private seed: ZapSession | null = null,
  ) {
    this.path = zapSessionPath(path);
  }

  async load(): Promise<ZapSession | null> {
    try {
      return parseSession(await readFile(this.path, 'utf8')) ?? this.seed;
    } catch {
      return this.seed;
    }
  }

  async save(session: ZapSession): Promise<void> {
    this.seed = session;
    await mkdir(dirname(this.path), { recursive: true, mode: 0o700 });

    const temporaryPath = `${this.path}.tmp`;
    const body = `${JSON.stringify(
      {
        access_token: session.accessToken,
        refresh_token: session.refreshToken,
        expires_at: session.expiresAt,
      },
      null,
      2,
    )}\n`;

    await writeFile(temporaryPath, body, { encoding: 'utf8', mode: 0o600 });
    await rename(temporaryPath, this.path);
  }
}

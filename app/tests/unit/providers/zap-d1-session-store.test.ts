import { describe, expect, it } from 'vitest';

import type {
  D1DatabaseLike,
  D1PreparedStatementLike,
  D1ResultLike,
} from '@/db/cloudflare/d1-database';
import { D1ZapSessionStore } from '@/providers/zap/live/d1-session-store';

interface Row {
  encrypted_payload: string;
  iv: string;
}

class SessionDatabase implements D1DatabaseLike {
  row: Row | null = null;

  prepare(sql: string): D1PreparedStatementLike {
    const database = this;
    let parameters: unknown[] = [];

    return {
      bind(...values: unknown[]) {
        parameters = values;
        return this;
      },
      async all<T>(): Promise<D1ResultLike<T>> {
        return { results: [] };
      },
      async first<T>(): Promise<T | null> {
        return database.row as T | null;
      },
      async run(): Promise<D1ResultLike> {
        if (sql.includes('INSERT INTO provider_sessions')) {
          database.row = {
            encrypted_payload: String(parameters[1]),
            iv: String(parameters[2]),
          };
        }
        return { meta: { changes: 1 } };
      },
    };
  }

  async batch(_statements: D1PreparedStatementLike[]): Promise<D1ResultLike[]> {
    return [];
  }
}

describe('D1ZapSessionStore', () => {
  it('uses the bootstrap session until an encrypted rotating session is saved', async () => {
    const database = new SessionDatabase();
    const store = new D1ZapSessionStore(database, 'test-secret', {
      accessToken: 'bootstrap-access',
      refreshToken: 'bootstrap-refresh',
      expiresAt: 100,
    });

    await expect(store.load()).resolves.toEqual({
      accessToken: 'bootstrap-access',
      refreshToken: 'bootstrap-refresh',
      expiresAt: 100,
    });

    await store.save({
      accessToken: 'rotated-access',
      refreshToken: 'rotated-refresh',
      expiresAt: 200,
    });

    expect(database.row?.encrypted_payload).not.toContain('rotated-access');
    await expect(store.load()).resolves.toEqual({
      accessToken: 'rotated-access',
      refreshToken: 'rotated-refresh',
      expiresAt: 200,
    });
  });

  it('does not silently fall back when the encryption key changes', async () => {
    const database = new SessionDatabase();
    const first = new D1ZapSessionStore(database, 'first-secret', null);
    await first.save({ accessToken: 'access', refreshToken: 'refresh' });

    const second = new D1ZapSessionStore(database, 'different-secret', null);
    await expect(second.load()).rejects.toThrow(
      'Stored Zap session could not be decrypted.',
    );
  });
});

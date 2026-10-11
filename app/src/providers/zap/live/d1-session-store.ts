import type { D1DatabaseLike } from '@/db/cloudflare/d1-database';

import type { ZapSession, ZapSessionStore } from './types';

const PROVIDER = 'zap';

interface SessionRow {
  encrypted_payload: string;
  iv: string;
}

interface StoredSession {
  accessToken?: string;
  refreshToken?: string;
  expiresAt?: number;
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function base64ToArrayBuffer(value: string): ArrayBuffer {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);

  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }

  return bytes.buffer;
}

async function encryptionKey(secret: string): Promise<CryptoKey> {
  const digest = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(secret),
  );
  return crypto.subtle.importKey('raw', digest, 'AES-GCM', false, [
    'encrypt',
    'decrypt',
  ]);
}

async function encryptSession(
  session: ZapSession,
  secret: string,
): Promise<{ payload: string; iv: string }> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const plaintext = new TextEncoder().encode(JSON.stringify(session));
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    await encryptionKey(secret),
    plaintext,
  );

  return {
    payload: bytesToBase64(new Uint8Array(ciphertext)),
    iv: bytesToBase64(iv),
  };
}

async function decryptSession(
  row: SessionRow,
  secret: string,
): Promise<ZapSession> {
  const plaintext = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: base64ToArrayBuffer(row.iv) },
    await encryptionKey(secret),
    base64ToArrayBuffer(row.encrypted_payload),
  );
  const parsed = JSON.parse(
    new TextDecoder().decode(plaintext),
  ) as StoredSession;

  return {
    accessToken:
      typeof parsed.accessToken === 'string' ? parsed.accessToken : undefined,
    refreshToken:
      typeof parsed.refreshToken === 'string' ? parsed.refreshToken : undefined,
    expiresAt:
      typeof parsed.expiresAt === 'number' ? parsed.expiresAt : undefined,
  };
}

export class D1ZapSessionStore implements ZapSessionStore {
  constructor(
    private readonly database: D1DatabaseLike,
    private readonly secret: string,
    private readonly seed: ZapSession | null,
  ) {}

  async load(): Promise<ZapSession | null> {
    const row = await this.database
      .prepare(
        `SELECT encrypted_payload, iv
         FROM provider_sessions
         WHERE provider = ?`,
      )
      .bind(PROVIDER)
      .first<SessionRow>();

    if (!row) return this.seed;

    try {
      return await decryptSession(row, this.secret);
    } catch {
      throw new Error(
        'Stored Zap session could not be decrypted. Check ZAP_SESSION_ENCRYPTION_KEY.',
      );
    }
  }

  async save(session: ZapSession): Promise<void> {
    const encrypted = await encryptSession(session, this.secret);

    await this.database
      .prepare(
        `INSERT INTO provider_sessions (
           provider,
           encrypted_payload,
           iv,
           updated_at
         ) VALUES (?, ?, ?, ?)
         ON CONFLICT(provider) DO UPDATE SET
           encrypted_payload = excluded.encrypted_payload,
           iv = excluded.iv,
           updated_at = excluded.updated_at`,
      )
      .bind(PROVIDER, encrypted.payload, encrypted.iv, new Date().toISOString())
      .run();
  }
}

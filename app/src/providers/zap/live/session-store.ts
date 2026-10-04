import type { ZapSession, ZapSessionStore } from './types';

export class MemoryZapSessionStore implements ZapSessionStore {
  constructor(private session: ZapSession | null = null) {}

  async load(): Promise<ZapSession | null> {
    return this.session;
  }

  async save(session: ZapSession): Promise<void> {
    this.session = session;
  }
}

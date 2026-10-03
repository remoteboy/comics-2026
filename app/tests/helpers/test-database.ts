import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';

import type { QueryDatabase, QueryParameter } from '@/db/database';

const schema = readFileSync(
  new URL('../../../d1/migrations/0001_initial.sql', import.meta.url),
  'utf8',
);
const seed = readFileSync(
  new URL('../fixtures/test-data.sql', import.meta.url),
  'utf8',
);

export class TestDatabase implements QueryDatabase {
  readonly #database = new DatabaseSync(':memory:');

  constructor() {
    this.#database.exec(schema);
    this.#database.exec(seed);
  }

  async all<T>(sql: string, parameters: QueryParameter[] = []): Promise<T[]> {
    return this.#database.prepare(sql).all(...parameters) as T[];
  }

  async get<T>(
    sql: string,
    parameters: QueryParameter[] = [],
  ): Promise<T | undefined> {
    return this.#database.prepare(sql).get(...parameters) as T | undefined;
  }

  close(): void {
    this.#database.close();
  }
}

export function createTestDatabase(): TestDatabase {
  return new TestDatabase();
}

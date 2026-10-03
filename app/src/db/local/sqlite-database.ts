import { resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

import type { QueryDatabase, QueryParameter } from '@/db/database';

export class SqliteDatabase implements QueryDatabase {
  readonly #database: DatabaseSync;

  constructor(path: string) {
    this.#database = new DatabaseSync(resolve(path), { readOnly: true });
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
}

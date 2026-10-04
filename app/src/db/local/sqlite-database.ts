import { resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

import type {
  MutationDatabase,
  MutationResult,
  MutationStatement,
  QueryParameter,
} from '@/db/database';

export class SqliteDatabase implements MutationDatabase {
  readonly #database: DatabaseSync;

  constructor(path: string) {
    this.#database = new DatabaseSync(resolve(path));
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

  async run(
    sql: string,
    parameters: QueryParameter[] = [],
  ): Promise<MutationResult> {
    return this.#run(sql, parameters);
  }

  async batch(statements: MutationStatement[]): Promise<MutationResult[]> {
    this.#database.exec('BEGIN IMMEDIATE');

    try {
      const results = statements.map((statement) =>
        this.#run(statement.sql, statement.parameters ?? []),
      );
      this.#database.exec('COMMIT');
      return results;
    } catch (error) {
      this.#database.exec('ROLLBACK');
      throw error;
    }
  }

  #run(sql: string, parameters: QueryParameter[]): MutationResult {
    const result = this.#database.prepare(sql).run(...parameters);
    return {
      changes: Number(result.changes),
      lastInsertRowid: result.lastInsertRowid,
    };
  }
}

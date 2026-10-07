import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';

import type {
  MutationDatabase,
  MutationResult,
  MutationStatement,
  QueryParameter,
} from '@/db/database';

const migrations = [
  new URL('../../../d1/migrations/0001_initial.sql', import.meta.url),
  new URL('../../../d1/migrations/0002_valuation_engine.sql', import.meta.url),
  new URL(
    '../../../d1/migrations/0003_valuation_provider_checks.sql',
    import.meta.url,
  ),
].map((url) => readFileSync(url, 'utf8'));
const seed = readFileSync(
  new URL('../fixtures/test-data.sql', import.meta.url),
  'utf8',
);

export class TestDatabase implements MutationDatabase {
  readonly #database = new DatabaseSync(':memory:');

  constructor() {
    for (const migration of migrations) this.#database.exec(migration);
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

  close(): void {
    this.#database.close();
  }

  #run(sql: string, parameters: QueryParameter[]): MutationResult {
    const result = this.#database.prepare(sql).run(...parameters);
    return {
      changes: Number(result.changes),
      lastInsertRowid: result.lastInsertRowid,
    };
  }
}

export function createTestDatabase(): TestDatabase {
  return new TestDatabase();
}

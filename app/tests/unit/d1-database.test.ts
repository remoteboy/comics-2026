import { describe, expect, it } from 'vitest';

import {
  D1Database,
  type D1DatabaseLike,
  type D1PreparedStatementLike,
  type D1ResultLike,
} from '@/db/cloudflare/d1-database';

class FakeStatement implements D1PreparedStatementLike {
  parameters: unknown[] = [];

  constructor(
    readonly sql: string,
    private readonly result: D1ResultLike,
  ) {}

  bind(...parameters: unknown[]): D1PreparedStatementLike {
    this.parameters = parameters;
    return this;
  }

  async all<T>(): Promise<D1ResultLike<T>> {
    return this.result as D1ResultLike<T>;
  }

  async first<T>(): Promise<T | null> {
    return (this.result.results?.[0] as T | undefined) ?? null;
  }

  async run(): Promise<D1ResultLike> {
    return this.result;
  }
}

class FakeD1 implements D1DatabaseLike {
  readonly statements: FakeStatement[] = [];

  prepare(sql: string): D1PreparedStatementLike {
    const statement = new FakeStatement(sql, {
      results: [{ id: 7, name: 'Example' }],
      meta: { changes: 1, last_row_id: 7 },
    });
    this.statements.push(statement);
    return statement;
  }

  async batch(statements: D1PreparedStatementLike[]): Promise<D1ResultLike[]> {
    return statements.map((_, index) => ({
      meta: { changes: 1, last_row_id: index + 10 },
    }));
  }
}

describe('D1Database', () => {
  it('maps query and mutation results to the shared database interface', async () => {
    const binding = new FakeD1();
    const database = new D1Database(binding);

    await expect(
      database.all<{ id: number }>('SELECT ?', [7]),
    ).resolves.toEqual([{ id: 7, name: 'Example' }]);
    await expect(
      database.get<{ id: number }>('SELECT ?', [7]),
    ).resolves.toEqual({
      id: 7,
      name: 'Example',
    });
    await expect(
      database.run('UPDATE example SET id = ?', [7]),
    ).resolves.toEqual({
      changes: 1,
      lastInsertRowid: 7,
    });
  });

  it('normalizes safe bigint parameters and batches atomically through D1', async () => {
    const binding = new FakeD1();
    const database = new D1Database(binding);

    const results = await database.batch([
      { sql: 'INSERT INTO example(id) VALUES (?)', parameters: [10n] },
      { sql: 'INSERT INTO example(id) VALUES (?)', parameters: [11] },
    ]);

    expect(binding.statements[0]?.parameters).toEqual([10]);
    expect(results).toEqual([
      { changes: 1, lastInsertRowid: 10 },
      { changes: 1, lastInsertRowid: 11 },
    ]);
  });

  it('rejects bigint parameters that D1 cannot represent safely', async () => {
    const database = new D1Database(new FakeD1());

    await expect(
      database.run('SELECT ?', [BigInt(Number.MAX_SAFE_INTEGER) + 1n]),
    ).rejects.toThrow('D1 cannot safely bind this bigint value.');
  });
});

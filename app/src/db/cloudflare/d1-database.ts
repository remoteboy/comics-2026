import type {
  MutationDatabase,
  MutationResult,
  MutationStatement,
  QueryParameter,
} from '@/db/database';

export interface D1ResultLike<T = unknown> {
  results?: T[];
  meta?: {
    changes?: number;
    last_row_id?: number;
  };
}

export interface D1PreparedStatementLike {
  bind(...parameters: unknown[]): D1PreparedStatementLike;
  all<T>(): Promise<D1ResultLike<T>>;
  first<T>(): Promise<T | null>;
  run(): Promise<D1ResultLike>;
}

export interface D1DatabaseLike {
  prepare(sql: string): D1PreparedStatementLike;
  batch(statements: D1PreparedStatementLike[]): Promise<Array<D1ResultLike>>;
}

function parameter(value: QueryParameter): unknown {
  if (typeof value !== 'bigint') return value;

  const numeric = Number(value);
  if (!Number.isSafeInteger(numeric)) {
    throw new RangeError('D1 cannot safely bind this bigint value.');
  }

  return numeric;
}

function mutationResult(result: D1ResultLike): MutationResult {
  return {
    changes: result.meta?.changes ?? 0,
    lastInsertRowid: result.meta?.last_row_id ?? 0,
  };
}

export class D1Database implements MutationDatabase {
  constructor(private readonly binding: D1DatabaseLike) {}

  async all<T>(sql: string, parameters: QueryParameter[] = []): Promise<T[]> {
    const result = await this.statement(sql, parameters).all<T>();
    return result.results ?? [];
  }

  async get<T>(
    sql: string,
    parameters: QueryParameter[] = [],
  ): Promise<T | undefined> {
    return (await this.statement(sql, parameters).first<T>()) ?? undefined;
  }

  async run(
    sql: string,
    parameters: QueryParameter[] = [],
  ): Promise<MutationResult> {
    return mutationResult(await this.statement(sql, parameters).run());
  }

  async batch(statements: MutationStatement[]): Promise<MutationResult[]> {
    if (!statements.length) return [];

    const prepared = statements.map((statement) =>
      this.statement(statement.sql, statement.parameters ?? []),
    );
    const results = await this.binding.batch(prepared);
    return results.map(mutationResult);
  }

  private statement(
    sql: string,
    parameters: QueryParameter[],
  ): D1PreparedStatementLike {
    return this.binding.prepare(sql).bind(...parameters.map(parameter));
  }
}

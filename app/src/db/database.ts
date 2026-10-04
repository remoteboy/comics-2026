export type QueryParameter = string | number | bigint | null;

export interface QueryDatabase {
  all<T>(sql: string, parameters?: QueryParameter[]): Promise<T[]>;
  get<T>(sql: string, parameters?: QueryParameter[]): Promise<T | undefined>;
}

export interface MutationStatement {
  sql: string;
  parameters?: QueryParameter[];
}

export interface MutationResult {
  changes: number;
  lastInsertRowid: number | bigint;
}

export interface MutationDatabase extends QueryDatabase {
  run(sql: string, parameters?: QueryParameter[]): Promise<MutationResult>;
  batch(statements: MutationStatement[]): Promise<MutationResult[]>;
}

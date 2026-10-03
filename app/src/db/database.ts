export type QueryParameter = string | number | bigint | null;

export interface QueryDatabase {
  all<T>(sql: string, parameters?: QueryParameter[]): Promise<T[]>;
  get<T>(sql: string, parameters?: QueryParameter[]): Promise<T | undefined>;
}

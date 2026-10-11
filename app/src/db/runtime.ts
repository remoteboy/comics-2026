import { runtimeConfig } from '@/config/runtime';
import type { MutationDatabase } from '@/db/database';
import { SqliteDatabase } from '@/db/local/sqlite-database';

export function createRuntimeDatabase(): MutationDatabase {
  return new SqliteDatabase(runtimeConfig().databasePath);
}

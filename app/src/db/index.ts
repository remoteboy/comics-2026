import { runtimeConfig } from '@/config/runtime';
import type { QueryDatabase } from '@/db/database';
import { SqliteDatabase } from '@/db/local/sqlite-database';

let instance: QueryDatabase | undefined;

export function database(): QueryDatabase {
  if (!instance) {
    instance = new SqliteDatabase(runtimeConfig().databasePath);
  }

  return instance;
}

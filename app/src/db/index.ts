import { runtimeConfig } from '@/config/runtime';
import type { MutationDatabase } from '@/db/database';
import { SqliteDatabase } from '@/db/local/sqlite-database';

let instance: MutationDatabase | undefined;

export function database(): MutationDatabase {
  if (!instance) {
    instance = new SqliteDatabase(runtimeConfig().databasePath);
  }

  return instance;
}

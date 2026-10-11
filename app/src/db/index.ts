import type { MutationDatabase } from '@/db/database';
import { createRuntimeDatabase } from '@/db/runtime';

let instance: MutationDatabase | undefined;

export function database(): MutationDatabase {
  instance ??= createRuntimeDatabase();
  return instance;
}

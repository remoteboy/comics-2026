import { resolve } from 'node:path';

import { applyMigrations } from './lib/migrations.mjs';

const databasePath = resolve(
  process.env.COMICS_DB_PATH ?? '../output/comics.d1.sqlite',
);
const migrationsDirectory = resolve('../d1/migrations');
const applied = applyMigrations(databasePath, migrationsDirectory);

if (applied.length) {
  console.log(`Applied migrations: ${applied.join(', ')}`);
} else {
  console.log('Database is already up to date.');
}

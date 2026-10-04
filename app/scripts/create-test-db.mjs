import { mkdirSync, readFileSync, rmSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';

import { applyMigrations } from './lib/migrations.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const appRoot = resolve(here, '..');
const databasePath = resolve(appRoot, '.test/comics.sqlite');
const migrationsDirectory = resolve(appRoot, '../d1/migrations');
const seedPath = resolve(appRoot, 'tests/fixtures/test-data.sql');

mkdirSync(dirname(databasePath), { recursive: true });
rmSync(databasePath, { force: true });
applyMigrations(databasePath, migrationsDirectory);

const database = new DatabaseSync(databasePath);
database.exec(readFileSync(seedPath, 'utf8'));
database.close();

console.log(`Created deterministic test database at ${databasePath}`);

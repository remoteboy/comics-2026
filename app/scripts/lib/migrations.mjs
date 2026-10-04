import { readdirSync, readFileSync } from 'node:fs';
import { basename, resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

function migrationFiles(directory) {
  return readdirSync(directory)
    .filter((name) => name.endsWith('.sql'))
    .sort();
}

function tableExists(database, name) {
  return Boolean(
    database
      .prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?")
      .get(name),
  );
}

export function applyMigrations(databasePath, migrationsDirectory) {
  const database = new DatabaseSync(resolve(databasePath));
  database.exec('PRAGMA foreign_keys = ON');
  database.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      name TEXT PRIMARY KEY,
      applied_at TEXT NOT NULL
    )
  `);

  const applied = new Set(
    database
      .prepare('SELECT name FROM schema_migrations ORDER BY name')
      .all()
      .map((row) => row.name),
  );

  const files = migrationFiles(migrationsDirectory);

  if (
    tableExists(database, 'holdings') &&
    !applied.has('0001_initial.sql') &&
    files.includes('0001_initial.sql')
  ) {
    database
      .prepare(
        "INSERT OR IGNORE INTO schema_migrations(name, applied_at) VALUES (?, datetime('now'))",
      )
      .run('0001_initial.sql');
    applied.add('0001_initial.sql');
  }

  const newlyApplied = [];

  for (const name of files) {
    if (applied.has(name)) continue;

    const sql = readFileSync(resolve(migrationsDirectory, name), 'utf8');
    database.exec('BEGIN IMMEDIATE');

    try {
      database.exec(sql);
      database
        .prepare(
          "INSERT INTO schema_migrations(name, applied_at) VALUES (?, datetime('now'))",
        )
        .run(name);
      database.exec('COMMIT');
      newlyApplied.push(name);
    } catch (error) {
      database.exec('ROLLBACK');
      database.close();
      throw error;
    }
  }

  database.close();
  return newlyApplied.map((name) => basename(name));
}

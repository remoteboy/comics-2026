import { resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

const path = resolve(process.env.COMICS_DB_PATH ?? '../output/comics.d1.sqlite');
const db = new DatabaseSync(path, { readOnly: true });

const expectations = {
  series: 1793,
  variants: 9577,
  holdings: 9572,
  boxes: 84,
};

for (const [table, expected] of Object.entries(expectations)) {
  const { count } = db.prepare(`SELECT COUNT(*) AS count FROM ${table}`).get();
  if (count !== expected) throw new Error(`${table}: expected ${expected}, received ${count}`);
  console.log(`✓ ${table}: ${count}`);
}

const { copies, valueCents } = db
  .prepare(`
    SELECT
      SUM(quantity) AS copies,
      SUM(COALESCE(current_value_cents, 0) * quantity) AS valueCents
    FROM holdings
  `)
  .get();

if (copies !== 9680) throw new Error(`copies: expected 9680, received ${copies}`);
if (valueCents !== 5208329) throw new Error(`value: expected 5208329, received ${valueCents}`);

console.log(`✓ physical copies: ${copies}`);
console.log(`✓ collection value cents: ${valueCents}`);
console.log('Data smoke check passed.');

import { readFileSync } from 'node:fs';

const fixtureRoot = new URL('../fixtures/providers/', import.meta.url);

export function providerFixture(name: string): unknown {
  return JSON.parse(
    readFileSync(new URL(name, fixtureRoot), 'utf8'),
  ) as unknown;
}

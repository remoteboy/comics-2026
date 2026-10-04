import { expect, test } from '@playwright/test';

const routes = [
  ['/', 'Collection overview'],
  ['/collection', 'Collection'],
  ['/collection/1', 'Alpha Adventures'],
  ['/comics/1', 'Alpha Adventures #1'],
  ['/boxes', 'Boxes'],
  ['/boxes/1', 'Short A'],
  ['/providers', 'Providers'],
] as const;

for (const [path, text] of routes) {
  test(`${path} renders from the deterministic fixture database`, async ({
    request,
  }) => {
    const response = await request.get(path);

    expect(response.ok()).toBe(true);
    expect(await response.text()).toContain(text);
  });
}

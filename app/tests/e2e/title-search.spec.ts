import { test, expect } from '@playwright/test';
test('global title suggestions support keyboard navigation on every screen', async ({
  page,
}) => {
  await page.goto('/boxes');
  const input = page.getByRole('combobox', {
    name: 'Search collection',
  });
  await input.fill('alpha');
  await expect(
    page.getByRole('option', { name: /Alpha Adventures/ }),
  ).toBeVisible();
  await input.press('ArrowDown');
  await expect(input).toHaveAttribute(
    'aria-activedescendant',
    'global-title-search-suggestions-0',
  );
  await input.press('Enter');
  await expect(page).toHaveURL(/\/collection\/1$/);
  await expect(
    page.getByRole('combobox', { name: 'Search collection' }),
  ).toBeVisible();
});
test('collection search has no-results feedback and a working submit fallback', async ({
  page,
}) => {
  await page.goto('/');
  const input = page.getByRole('combobox', {
    name: 'Search collection',
  });
  await input.fill('no-such-title');
  await expect(
    page.getByText('No matches. Try another name.', { exact: true }),
  ).toBeVisible();
  await input.press('Escape');
  await expect(input).toHaveAttribute('aria-expanded', 'false');
  await input.fill('Alpha');
  await input.press('Enter');
  await expect(page).toHaveURL(/\/collection\?q=Alpha/);
});
test('intake autocomplete selects a provider title', async ({ page }) => {
  await page.route('**/api/intake/titles?**', async (route) => {
    const q = new URL(route.request().url()).searchParams.get('q');
    await route.fulfill({
      json: {
        items:
          q === 'Alpha'
            ? [
                {
                  label: 'Alpha Provider',
                  detail: 'Zap title',
                  href: '/intake?source=manual&titleName=Alpha',
                },
              ]
            : [],
      },
    });
  });
  await page.goto('/intake');
  const input = page.getByRole('combobox', { name: 'Title name' });
  await input.fill('Alpha');
  await expect(
    page.getByRole('option', { name: /Alpha Provider/ }),
  ).toBeVisible();
  await page
    .getByRole('option', { name: /Alpha Provider/ })
    .getByRole('link')
    .click();
  await expect(page).toHaveURL(/source=manual/);
});
test('mobile intake search preserves the form when provider suggestions fail', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.route('**/api/intake/titles?**', (route) =>
    route.fulfill({
      status: 503,
      json: { error: 'Zap search unavailable. Try Find titles.' },
    }),
  );
  await page.goto('/intake');
  const input = page.getByRole('combobox', { name: 'Title name' });
  await input.fill('Batman');
  await expect(
    page
      .getByText('Zap search unavailable. Try Find titles.', { exact: true })
      .first(),
  ).toBeVisible();
  await expect(input).toHaveValue('Batman');
  await expect(
    page.getByRole('link', { name: 'Enter a comic manually', exact: true }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
});

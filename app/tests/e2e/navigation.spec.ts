import { expect, test } from '@playwright/test';

test('primary collection navigation works in a browser', async ({ page }) => {
  await page.goto('/');
  await expect(
    page.getByRole('heading', { name: 'Collection overview' }),
  ).toBeVisible();

  await page.getByRole('link', { name: 'Collection', exact: true }).click();
  await expect(page).toHaveURL(/\/collection$/);
  await expect(page.getByRole('heading', { name: 'Collection' })).toBeVisible();

  await page.getByRole('link', { name: /Alpha Adventures/ }).click();
  await expect(
    page.getByRole('heading', { name: 'Alpha Adventures' }),
  ).toBeVisible();

  await page
    .getByRole('link', { name: /Alpha Adventures #1/ })
    .first()
    .click();
  await expect(
    page.getByRole('heading', { name: 'Alpha Adventures #1' }),
  ).toBeVisible();
});

test('box navigation crosses gaps in legacy box IDs', async ({ page }) => {
  await page.goto('/boxes/1');

  await expect(page.getByRole('heading', { name: 'Short A' })).toBeVisible();
  await page.getByRole('link', { name: 'Next box, 3' }).click();
  await expect(page.getByRole('heading', { name: 'Long C' })).toBeVisible();
});

test('provider status page exposes recorded and current Zap profiles', async ({
  page,
}) => {
  await page.goto('/providers');

  await expect(page.getByRole('heading', { name: 'Providers' })).toBeVisible();
  await expect(
    page.getByText('Recorded ZapKapow', { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText('Current ZapKapow', { exact: true }),
  ).toBeVisible();
});

import { expect, test } from '@playwright/test';
test('valuations explains automatic refresh status in local development', async ({
  page,
}) => {
  await page.goto('/valuations');
  await expect(
    page.getByText('Automatic refresh: disabled in this environment.', {
      exact: true,
    }),
  ).toBeVisible();
});
test('manual valuation refreshes reject foreign origins', async ({
  request,
}) => {
  const form = await request.post('/valuations', {
    headers: { Origin: 'https://foreign.invalid' },
    form: { action: 'sync-zap' },
  });
  expect(form.status()).toBe(403);
  const api = await request.post('/api/valuations/backfill', {
    headers: { Origin: 'https://foreign.invalid' },
  });
  expect(api.status()).toBe(403);
});

test('valuations keeps long tools and movements collapsed but available', async ({
  page,
}) => {
  await page.goto('/valuations');
  const baseline = page.locator('details').filter({
    has: page.locator('summary', { hasText: 'Full valuation baseline' }),
  });
  await expect(baseline).not.toHaveAttribute('open');
  await baseline.locator('summary').click();
  await expect(
    page.getByRole('heading', {
      name: 'Initial collection check',
      exact: true,
    }),
  ).toBeVisible();
  const movements = page
    .locator('details')
    .filter({ has: page.locator('summary', { hasText: 'Movement windows' }) });
  await expect(movements).not.toHaveAttribute('open');
  await movements.locator('summary').click();
  await expect(movements).toHaveAttribute('open', '');
  await expect(page.getByText(/Times shown in Dublin time/)).toBeVisible();
});

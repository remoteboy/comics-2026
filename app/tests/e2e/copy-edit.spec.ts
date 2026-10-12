import { expect, test } from '@playwright/test';

test('edit a copy, add another and choose its own history', async ({
  page,
}) => {
  await page.goto('/comics/3');
  await page.getByRole('link', { name: 'Edit copy', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'Edit your copy' }),
  ).toBeVisible();
  await page.getByLabel('Box', { exact: true }).selectOption('1');
  await page.getByRole('button', { name: 'Save to collection' }).click();
  await expect(page).toHaveURL(/\/comics\/3\?copy=3&saved=1$/);
  await expect(page.getByRole('status')).toHaveText(
    'Saved to your collection.',
  );

  await page
    .getByRole('link', { name: 'Add another copy', exact: true })
    .click();
  await page.getByLabel('Grade', { exact: true }).fill('9.4');
  await page
    .getByLabel('Current value', { exact: true })
    .selectOption('unknown');
  await page
    .getByLabel('Current value', { exact: true })
    .selectOption('manual');
  await page.getByLabel('Manual current value (USD)').fill('12.50');
  await page.getByRole('button', { name: 'Save to collection' }).click();
  await expect(page).toHaveURL(/\/comics\/3\?copy=\d+&saved=1$/);
  await expect(
    page.getByText('Manual estimate', { exact: true }),
  ).toBeVisible();
  await expect(page.getByLabel('Price history for')).toBeVisible();
  await expect(
    page.getByRole('heading', { name: 'Price history' }),
  ).toBeVisible();
});

test('copy save rejects a foreign origin', async ({ request }) => {
  const response = await request.post('/copies/2/edit', {
    headers: { origin: 'https://other.example' },
    form: {
      requestId: crypto.randomUUID(),
      expectedVersion: '0',
      scope: 'all',
      variantId: '2',
      grade: '9.4',
      quantity: '1',
      boxId: '',
      purchasePrice: '',
      purchaseDate: '',
      valueMode: 'unknown',
      manualValue: '',
    },
  });
  expect(response.status()).toBe(403);
});

test('new copies default to Zap pricing and a failed lookup keeps the form open', async ({
  page,
}) => {
  await page.goto('/copies/2/edit?action=add');
  await expect(page.getByLabel('Current value', { exact: true })).toHaveValue(
    'zap',
  );
  await page
    .getByLabel('Purchase price per copy (USD)', { exact: true })
    .fill('4.99');
  await page.getByLabel('Purchase date', { exact: true }).fill('2026-10-12');
  await page.getByRole('button', { name: 'Check Zap value' }).click();
  await expect(
    page.getByText(
      'This cover has no Zap match. Enter a manual value or explicitly save without a value.',
      { exact: true },
    ),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Save to collection' }).click();
  await expect(page.getByRole('alert')).toContainText(
    'This cover has no Zap match',
  );
  await expect(
    page.getByLabel('Purchase price per copy (USD)', { exact: true }),
  ).toHaveValue('4.99');
  await expect(page.getByLabel('Purchase date', { exact: true })).toHaveValue(
    '2026-10-12',
  );
  await expect(page).toHaveURL(/\/copies\/2\/edit\?action=add$/);
});

test('a restored grade and a new purchase rejoin the same visible group', async ({
  page,
}) => {
  await page.goto('/comics/1');
  await page.getByRole('link', { name: 'Edit copies', exact: true }).click();
  await page
    .getByLabel('What would you like to do?', { exact: true })
    .selectOption('all');
  await page.getByLabel('Quantity', { exact: true }).fill('5');
  await page
    .getByLabel('Current value', { exact: true })
    .selectOption('manual');
  await page
    .getByLabel('Manual current value (USD)', { exact: true })
    .fill('10.00');
  await page.getByRole('button', { name: 'Save to collection' }).click();
  await expect(page.locator('[data-copy-group]')).toHaveAttribute(
    'data-quantity',
    '5',
  );

  await page.getByRole('link', { name: 'Edit copies', exact: true }).click();
  await page.getByLabel('Grade', { exact: true }).fill('9.3');
  await page
    .getByLabel('Current value', { exact: true })
    .selectOption('unknown');
  await page.getByRole('button', { name: 'Save to collection' }).click();
  await expect(page.locator('[data-copy-group]')).toHaveCount(2);
  await page
    .locator('[data-copy-group="1:93:1"]')
    .getByRole('link', { name: 'Edit copy', exact: true })
    .click();
  await page.getByLabel('Grade', { exact: true }).fill('9.4');
  await page
    .getByLabel('Current value', { exact: true })
    .selectOption('unknown');
  await page.getByRole('button', { name: 'Save to collection' }).click();
  await expect(page.locator('[data-copy-group]')).toHaveCount(1);
  await expect(page.locator('[data-copy-group]')).toHaveAttribute(
    'data-quantity',
    '5',
  );

  await page
    .getByRole('link', { name: 'Add another copy', exact: true })
    .click();
  await page
    .getByLabel('Purchase price per copy (USD)', { exact: true })
    .fill('9.00');
  await page.getByLabel('Purchase date', { exact: true }).fill('2026-10-12');
  await page
    .getByLabel('Current value', { exact: true })
    .selectOption('unknown');
  await page.getByRole('button', { name: 'Save to collection' }).click();
  await expect(page.locator('[data-copy-group]')).toHaveCount(1);
  await expect(page.locator('[data-copy-group]')).toHaveAttribute(
    'data-quantity',
    '6',
  );
  await expect(
    page.getByText('2 copies awaiting value', { exact: true }),
  ).toBeVisible();
  await page
    .getByText('Edit copies & purchase details', { exact: true })
    .click();
  await expect(
    page.getByText('Purchased 12 Oct 2026 · paid $9.00 per copy', {
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    page.getByRole('link', { name: 'Price history', exact: true }),
  ).toHaveCount(3);

  await page.goto('/collection/1');
  await expect(page.locator('a[href^="/comics/1?copy="]')).toHaveCount(1);
  await page.goto('/collection/1?view=list');
  await expect(page.locator('a[href^="/comics/1?copy="]')).toHaveCount(1);
  await page.goto('/boxes/1');
  await expect(page.locator('a[href^="/comics/1?copy="]')).toHaveCount(1);
});

test('purchase drafts stay separate when switching between edits and new purchases', async ({
  page,
}) => {
  await page.goto('/copies/1/edit');
  const scope = page.getByLabel('What would you like to do?', { exact: true });
  const price = page.getByLabel('Purchase price per copy (USD)', {
    exact: true,
  });
  const date = page.getByLabel('Purchase date', { exact: true });
  await price.fill('3.50');
  await date.fill('2024-02-29');
  await scope.selectOption('add');
  await expect(price).toHaveValue('');
  const today = await page.evaluate(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  });
  await expect(date).toHaveValue(today);
  await price.fill('9.00');
  await date.fill('2026-10-12');
  await scope.selectOption('all');
  await expect(price).toHaveValue('3.50');
  await expect(date).toHaveValue('2024-02-29');
  await scope.selectOption('add');
  await expect(price).toHaveValue('9.00');
  await expect(date).toHaveValue('2026-10-12');
});

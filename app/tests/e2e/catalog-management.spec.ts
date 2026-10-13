import { test, expect, type Page } from '@playwright/test';
async function seedComic(
  page: Page,
  title: string,
  publisher: string,
  creator = '',
  role = 'writer',
) {
  await page.goto('/intake?source=manual');
  const response = await page.request.post('/intake', {
    headers: { Origin: new URL(page.url()).origin },
    multipart: {
      requestId: crypto.randomUUID(),
      lookupId: '',
      coverId: '',
      localSeriesId: '',
      titleName: title,
      titleYear: '2026',
      titleStatus: 'ongoing',
      number: '1',
      issueType: 'issue',
      grade: '9.4',
      quantity: '1',
      boxId: '',
      purchasePrice: '',
      purchaseDate: '2026-10-13',
      valueMode: 'manual',
      manualValue: '10',
      expectedVersion: '0',
      variantName: '',
      storyTitle: '',
      firstAppearanceOf: '',
      details: '',
      publisherName: publisher,
      coverPrice: '',
      creatorName: creator,
      creatorRole: role,
    },
  });
  expect(response.ok()).toBe(true);
  expect(new URL(response.url()).pathname).toMatch(/^\/comics\/\d+$/);
  return response.url();
}
test('creator directory links comics, renames with aliases and protects foreign writes', async ({
  page,
}) => {
  const comic = await seedComic(
    page,
    'Creator Directory Browser Test',
    'Creator Test Publisher',
    'Creator Browser Source',
  );
  await page.goto('/creators');
  await page.getByRole('link', { name: /Creator Browser Source/ }).click();
  const creatorUrl = page.url();
  await expect(
    page.getByRole('heading', { name: 'Creator Browser Source', exact: true }),
  ).toBeVisible();
  await page.locator('[data-creator-series] summary').click();
  await expect(
    page.getByRole('link', {
      name: 'Creator Directory Browser Test #1',
      exact: true,
    }),
  ).toBeVisible();
  await page.getByText('Edit creator name', { exact: true }).click();
  await page
    .getByLabel('Name', { exact: true })
    .fill('Creator Browser Canonical');
  await page.getByRole('button', { name: 'Save name', exact: true }).click();
  await expect(
    page.getByRole('heading', {
      name: 'Creator Browser Canonical',
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    page.getByText('Also known as: Creator Browser Source', { exact: true }),
  ).toBeVisible();
  await page.goto(comic);
  await expect(
    page.getByRole('link', { name: 'Creator Browser Canonical', exact: true }),
  ).toBeVisible();
  const response = await page.request.post(creatorUrl, {
    headers: { Origin: 'https://foreign.invalid' },
    form: { action: 'rename' },
  });
  expect(response.status()).toBe(403);
});
test('publisher directory merges an explicit duplicate and searches its old name', async ({
  page,
}) => {
  await seedComic(
    page,
    'Publisher Directory Target Test',
    'Publisher Browser Canonical',
  );
  const comic = await seedComic(
    page,
    'Publisher Directory Source Test',
    'Publisher Browser Duplicate',
  );
  await page.goto(comic);
  await page
    .getByRole('link', { name: 'Publisher Browser Duplicate', exact: true })
    .click();
  const oldLink = page.url();
  await page.getByText('Merge duplicates', { exact: true }).click();
  await page
    .getByLabel('Find the record to keep', { exact: true })
    .fill('Publisher Browser Canonical');
  await page.getByRole('button', { name: 'Find record', exact: true }).click();
  await page
    .getByRole('radio', { name: /Publisher Browser Canonical/ })
    .check();
  await page
    .getByRole('checkbox', {
      name: 'I have checked that both records describe the same publisher.',
      exact: true,
    })
    .check();
  await page
    .getByRole('button', { name: 'Merge into selected record', exact: true })
    .click();
  await expect(
    page.getByRole('heading', {
      name: 'Publisher Browser Canonical',
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    page.getByText('Also known as: Publisher Browser Duplicate', {
      exact: true,
    }),
  ).toBeVisible();
  await page.goto(oldLink);
  await expect(
    page.getByRole('heading', {
      name: 'Publisher Browser Canonical',
      exact: true,
    }),
  ).toBeVisible();
  const input = page.getByRole('combobox', {
    name: 'Search collection',
    exact: true,
  });
  await input.fill('Publisher Browser Duplicate');
  await expect(
    page.getByRole('option', {
      name: /Publisher Browser Canonical.*Publisher/,
    }),
  ).toBeVisible();
});

test('publisher results show series while creator groups expand and filter with scoped autocomplete', async ({
  page,
}) => {
  const comic = await seedComic(
    page,
    'Browse Alpha Series',
    'Browse Publisher',
    'Browse Creator',
  );
  await seedComic(
    page,
    'Browse Beta Series',
    'Browse Publisher',
    'Browse Creator',
    'inker',
  );
  await page.goto(comic);
  await page
    .getByRole('link', { name: 'Browse Publisher', exact: true })
    .click();
  await expect(
    page.getByRole('link', { name: /Browse Alpha Series.*1 issues/ }),
  ).toBeVisible();
  await expect(
    page.getByRole('link', { name: 'Browse Alpha Series #1', exact: true }),
  ).toHaveCount(0);
  await page.goto(comic);
  await page.getByRole('link', { name: 'Browse Creator', exact: true }).click();
  await expect(page.locator('[data-creator-series]')).toHaveCount(2);
  const input = page.getByRole('combobox', {
    name: 'Series title',
    exact: true,
  });
  await input.fill('Browse Alpha');
  await expect(page.locator('[data-creator-series]')).toHaveCount(1);
  await expect(
    page.getByLabel('Owned copies only', { exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole('option', { name: /Browse Alpha Series/ }),
  ).toBeVisible();
  await input.press('ArrowDown');
  await input.press('Enter');
  await expect(page.locator('[data-creator-series]')).toHaveCount(1);
  await expect(
    page.getByRole('link', { name: 'Browse Alpha Series #1', exact: true }),
  ).toBeVisible();
  await page.getByLabel('Role', { exact: true }).selectOption('writer');
  await expect(page).toHaveURL(/role=writer/);
  await expect(
    page.getByRole('link', { name: 'Browse Alpha Series #1', exact: true }),
  ).toBeVisible();
  await page.getByRole('link', { name: 'Clear filters', exact: true }).click();
  const beta = page
    .locator('[data-creator-series]')
    .filter({ has: page.getByText('Browse Beta Series', { exact: true }) });
  await beta.locator('summary').click();
  await expect(
    beta.getByRole('link', { name: 'Browse Beta Series #1', exact: true }),
  ).toBeVisible();
  await page.getByLabel('Role', { exact: true }).selectOption('writer');
  await expect(
    page.getByText('Browse Beta Series', { exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByText('Browse Alpha Series', { exact: true }),
  ).toBeVisible();
  await page.getByLabel('Role', { exact: true }).selectOption('inker');
  await expect(
    page.getByText('Browse Alpha Series', { exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByText('Browse Beta Series', { exact: true }),
  ).toBeVisible();
});

test('live publisher filtering keeps the latest text and ignores older responses', async ({
  page,
}) => {
  await page.goto('/publishers/1');
  await page.route('**/publishers/1?title=*', async (route) => {
    const title = new URL(route.request().url()).searchParams.get('title');
    if (title === 'Al')
      await new Promise((resolve) => setTimeout(resolve, 500));
    try {
      await route.fulfill({
        contentType: 'text/html',
        body: `<div data-catalog-results><p>${title === 'Al' ? 'Older result' : 'Latest result'}</p></div>`,
      });
    } catch {
      /* The earlier request may have been aborted. */
    }
  });
  const input = page.getByRole('combobox', {
    name: 'Series title',
    exact: true,
  });
  const first = page.waitForRequest(
    (request) =>
      new URL(request.url()).pathname === '/publishers/1' &&
      new URL(request.url()).searchParams.get('title') === 'Al',
  );
  await input.fill('Al');
  await first;
  await input.fill('We');
  await expect(page.getByText('Latest result', { exact: true })).toBeVisible();
  await expect(page.getByText('Older result', { exact: true })).toHaveCount(0);
  await expect(input).toHaveValue('We');
  await expect(input).toBeFocused();
});

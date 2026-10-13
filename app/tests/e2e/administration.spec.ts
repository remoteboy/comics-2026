import { test, expect, type Page } from '@playwright/test';
async function purchase(page: Page, title: string, box = '') {
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
      boxId: box,
      purchasePrice: '5',
      purchaseDate: '2026-10-13',
      valueMode: 'manual',
      manualValue: '10',
      expectedVersion: '0',
      variantName: '',
      storyTitle: '',
      firstAppearanceOf: '',
      details: '',
      publisherName: 'Administration Publisher',
      coverPrice: '',
      creatorName: '',
      creatorRole: 'writer',
    },
  });
  expect(response.ok()).toBe(true);
  return response.url();
}
test('series editor updates status, year and search aliases', async ({
  page,
}) => {
  const name = 'Series Administration Browser (2026)';
  const comic = await purchase(page, name);
  await page.goto(comic);
  await page.getByRole('link', { name, exact: true }).click();
  await page.getByRole('link', { name: 'Edit series', exact: true }).click();
  await page
    .getByLabel('Sort name', { exact: true })
    .fill('Administration, Series Browser');
  await page.getByLabel('Start year', { exact: true }).fill('2027');
  await page.getByLabel('Status', { exact: true }).selectOption('ended');
  await page
    .getByRole('button', { name: 'Save series details', exact: true })
    .click();
  await expect(
    page.getByRole('heading', {
      name: 'Series Administration Browser (2027)',
      exact: true,
    }),
  ).toBeVisible();
  await expect(page.getByRole('status')).toHaveText('Series details saved.');
  const search = page.getByRole('combobox', {
    name: 'Search collection',
    exact: true,
  });
  await search.fill(name);
  await expect(
    page.getByRole('option', {
      name: /Series Administration Browser \(2027\)/,
    }),
  ).toBeVisible();
});
test('box controls create, edit, protect used boxes and remove empty boxes', async ({
  page,
}) => {
  await page.goto('/boxes');
  await page.getByRole('link', { name: 'Add box', exact: true }).click();
  await page
    .getByLabel('Label', { exact: true })
    .fill('Administration Browser Box');
  await page.getByLabel('Box type', { exact: true }).selectOption('long');
  await page.getByRole('button', { name: 'Create box', exact: true }).click();
  const boxPath = new URL(page.url()).pathname;
  const boxId = boxPath.split('/').at(-1)!;
  await page.getByRole('link', { name: 'Edit box', exact: true }).click();
  await page
    .getByLabel('Label', { exact: true })
    .fill('Administration Renamed Box');
  await page.getByLabel('Box type', { exact: true }).selectOption('magazine');
  await page
    .getByRole('button', { name: 'Save box details', exact: true })
    .click();
  await expect(
    page.getByRole('heading', {
      name: 'Administration Renamed Box',
      exact: true,
    }),
  ).toBeVisible();
  const comic = await purchase(page, 'Box Administration Purchase', boxId);
  await page.goto(boxPath + '/edit');
  await page.getByText('Remove empty box', { exact: true }).click();
  await expect(
    page.getByText(
      'Move the remaining collection entries out of this box first.',
      { exact: true },
    ),
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Remove box', exact: true }),
  ).toHaveCount(0);
  await page.goto(comic);
  const move = page.locator('[data-box-move]');
  await move.locator('summary').click();
  await move.getByLabel('Move to box', { exact: true }).selectOption('');
  await move.getByRole('button', { name: 'Save box', exact: true }).click();
  await page.goto(boxPath + '/edit');
  await page.getByText('Remove empty box', { exact: true }).click();
  await page
    .getByRole('checkbox', { name: `Remove empty box ${boxId}.`, exact: true })
    .check();
  await page.getByRole('button', { name: 'Remove box', exact: true }).click();
  await expect(page.getByRole('status')).toHaveText('Empty box removed.');
});
test('box filters autocomplete and narrow the list as you type', async ({
  page,
}) => {
  await page.goto('/boxes');
  const input = page.getByRole('combobox', { name: 'Find box', exact: true });
  await input.fill('Short A');
  await expect(page.locator('[data-box-results] a')).toHaveCount(1);
  await expect(
    page.getByRole('option', { name: /Box 1.*Short A/ }),
  ).toBeVisible();
  await page.getByLabel('Type', { exact: true }).selectOption('magazine');
  await expect(
    page
      .locator('[data-box-results]')
      .getByText('No matching boxes', { exact: true }),
  ).toBeVisible();
  await expect(page.locator('[data-box-results] a')).toHaveCount(0);
  const response = await page.request.post('/boxes/new', {
    headers: { Origin: 'https://foreign.invalid' },
    form: { action: 'create' },
  });
  expect(response.status()).toBe(403);
});

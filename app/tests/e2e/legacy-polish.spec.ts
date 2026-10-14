import { expect, test, type Page } from '@playwright/test';

async function seedComic(
  page: Page,
  details = '',
  issueType: 'issue' | 'annual' = 'issue',
) {
  await page.goto('/intake?source=manual');
  const response = await page.request.post('/intake', {
    headers: { Origin: new URL(page.url()).origin },
    multipart: {
      requestId: crypto.randomUUID(),
      lookupId: '',
      coverId: '',
      localSeriesId: '',
      titleName: `Legacy Polish Browser ${crypto.randomUUID()}`,
      titleYear: '2026',
      titleStatus: 'ongoing',
      number: '1',
      issueType,
      grade: '9.4',
      quantity: '2',
      boxId: '1',
      purchasePrice: '5.00',
      purchaseDate: '2026-10-13',
      valueMode: 'manual',
      manualValue: '18.00',
      expectedVersion: '0',
      variantName: '',
      storyTitle: '',
      firstAppearanceOf: '',
      details,
      publisherName: '',
      coverPrice: '',
    },
  });
  expect(response.ok()).toBe(true);
  return response.url();
}

test('provider suggestions preserve entered details, deduplicate credits and require explicit notes replacement', async ({
  page,
}) => {
  await page.route('**/api/comics/1/metadata', (route) =>
    route.fulfill({
      json: {
        storyTitle: 'Provider story',
        firstAppearanceOf: 'Provider significance',
        publisherName: 'Provider publisher',
        coverPriceCents: 999,
        details: 'Provider notes\nSecond paragraph.',
        credits: [
          { name: 'Jane Writer', role: 'writer' },
          { name: 'Provider Browser Artist', role: 'cover_artist' },
        ],
        notice: 'Zap details were matched to this exact cover.',
      },
    }),
  );
  await page.goto('/comics/1/edit');
  await page
    .getByLabel('Story title', { exact: true })
    .fill('My unsaved story');
  await page
    .getByLabel('Comic notes', { exact: true })
    .fill('My unsaved notes');
  const button = page.getByRole('button', {
    name: 'Fetch from Zap',
    exact: true,
  });
  await button.click();
  await expect(page.locator('[data-metadata-message]')).toContainText(
    '1 creator credit added',
  );
  await expect(page.getByLabel('Story title', { exact: true })).toHaveValue(
    'My unsaved story',
  );
  await expect(page.getByLabel('Comic notes', { exact: true })).toHaveValue(
    'My unsaved notes',
  );
  await expect(page.getByLabel('Publisher', { exact: true })).toHaveValue(
    'DC Comics',
  );
  await expect(page.locator('[name="creatorName"]')).toHaveCount(4);
  await button.click();
  await expect(page.locator('[data-metadata-message]')).toContainText(
    '0 creator credits added',
  );
  await expect(page.locator('[name="creatorName"]')).toHaveCount(4);
  await page
    .getByRole('button', { name: 'Replace my notes with these', exact: true })
    .click();
  await expect(page.getByLabel('Comic notes', { exact: true })).toHaveValue(
    'Provider notes\nSecond paragraph.',
  );
  // Leaving without Save must discard the suggestions and our unsaved edits.
  await page.goto('/comics/1/edit');
  await expect(page.getByLabel('Story title', { exact: true })).toHaveValue(
    'The Beginning',
  );
  await expect(page.getByLabel('Comic notes', { exact: true })).toHaveValue(
    'Primary fixture variant.',
  );
});

test('failed metadata lookup retains edits and rejects a foreign-origin request', async ({
  page,
}) => {
  await page.route('**/api/comics/1/metadata', (route) =>
    route.fulfill({
      status: 503,
      json: { error: 'Provider unavailable. Your edits are unchanged.' },
    }),
  );
  await page.goto('/comics/1/edit');
  await page.getByLabel('Comic notes', { exact: true }).fill('Keep my draft');
  await page
    .getByRole('button', { name: 'Fetch from Zap', exact: true })
    .click();
  await expect(page.locator('[data-metadata-message]')).toContainText(
    'Provider unavailable',
  );
  await expect(page.getByLabel('Comic notes', { exact: true })).toHaveValue(
    'Keep my draft',
  );
  await expect(
    page.getByRole('button', { name: 'Fetch from Zap', exact: true }),
  ).toBeEnabled();
  const response = await page.request.post('/api/comics/1/metadata', {
    headers: { Origin: 'https://foreign.invalid' },
    form: { source: 'zap', expectedVersion: '0' },
  });
  expect(response.status()).toBe(403);
});

test('series filter narrows as you type, suggests matching issues and clears without changing list view', async ({
  page,
}) => {
  await page.goto('/collection/1?view=list');
  const input = page.getByRole('combobox', {
    name: 'Filter this series',
    exact: true,
  });
  await input.fill('Foil');
  await expect(page.locator('[data-series-filter-message]')).toHaveText(
    'Showing comics matching “Foil”.',
  );
  await expect(page.locator('[data-series-results]')).toContainText(
    'Foil Cover',
  );
  await expect(page.locator('[data-series-results]')).not.toContainText(
    'Variant A',
  );
  await expect(
    page.getByRole('option', { name: /#1\/2.*Foil Cover/ }),
  ).toBeVisible();
  await expect(page).toHaveURL(/view=list&q=Foil$/);
  await page.getByRole('link', { name: 'Clear', exact: true }).click();
  await expect(input).toHaveValue('');
  await expect(page.locator('[data-series-filter-message]')).toHaveText(
    'Showing all comics in this series.',
  );
  await expect(page).toHaveURL(/\/collection\/1\?view=list$/);
  await input.fill('No such issue anywhere');
  await expect(
    page
      .locator('[data-series-results]')
      .getByText('No matching comics', { exact: true }),
  ).toBeVisible();
});

test('series filtering and Clear work without JavaScript', async ({
  browser,
}) => {
  const context = await browser.newContext({ javaScriptEnabled: false });
  const page = await context.newPage();
  await page.goto('http://127.0.0.1:4322/collection/1?view=list&q=Foil');
  await expect(page.locator('[data-series-results]')).toContainText(
    'Foil Cover',
  );
  await page.getByRole('link', { name: 'Clear', exact: true }).click();
  await expect(page).toHaveURL(/\/collection\/1\?view=list$/);
  await expect(page.locator('[data-series-results]')).toContainText(
    'Variant A',
  );
  await context.close();
});

test('removes a purchase group with confirmation and restores its copies and price history', async ({
  page,
}) => {
  const comicUrl = await seedComic(page);
  await page.goto(comicUrl);
  const title = await page.getByRole('heading', { level: 1 }).textContent();
  const seriesUrl = await page
    .getByRole('link', { name: /Back to Legacy Polish Browser/ })
    .getAttribute('href');
  await page.getByRole('link', { name: 'Remove copies', exact: true }).click();
  const removeUrl = page.url();
  const foreign = await page.request.post(removeUrl, {
    headers: { Origin: 'https://foreign.invalid' },
    form: {},
  });
  expect(foreign.status()).toBe(403);
  await page
    .getByRole('checkbox', {
      name: 'Remove all 2 copies in this purchase group',
      exact: true,
    })
    .check();
  await page
    .getByRole('button', { name: 'Remove copies', exact: true })
    .click();
  await expect(page.getByRole('status')).toContainText('Copies removed');
  await expect(
    page.getByText('You currently own no copies of this cover.', {
      exact: true,
    }),
  ).toBeVisible();
  await expect(page.locator('#removed-copies')).toHaveAttribute('open', '');
  await page.goto(seriesUrl!);
  await expect(page.locator('#removed-copies summary')).toHaveText(
    'Removed copies (2)',
  );
  await page.locator('#removed-copies summary').click();
  await expect(
    page
      .locator('#removed-copies')
      .getByRole('link', { name: 'Restore copies', exact: true }),
  ).toBeVisible();
  await page.goto('/boxes/1');
  await expect(
    page.getByRole('link', { name: title!, exact: true }),
  ).toHaveCount(0);
  await page.goto(new URL(comicUrl).pathname);
  await page.getByText('Removed copies', { exact: true }).click();
  await page.getByRole('link', { name: 'Restore copies', exact: true }).click();
  await page
    .getByRole('checkbox', {
      name: 'Restore all 2 copies in this purchase group',
      exact: true,
    })
    .check();
  await page
    .getByRole('button', { name: 'Restore copies', exact: true })
    .click();
  await expect(page.getByRole('status')).toHaveText('Copies restored.');
  await expect(
    page.getByRole('link', { name: 'Edit copies', exact: true }),
  ).toBeVisible();
  await expect(page.locator('#price-history')).toContainText('$18.00');
});

test('series search matches Annual and its box link scopes the contents to that series', async ({
  page,
}) => {
  const url = await seedComic(page, '', 'annual');
  await page.goto(url);
  await page
    .getByRole('link', { name: /Back to Legacy Polish Browser/ })
    .click();
  await page
    .getByRole('combobox', { name: 'Filter this series', exact: true })
    .fill('annual');
  await expect(page.locator('[data-series-filter-message]')).toHaveText(
    'Showing comics matching “annual”.',
  );
  await expect(
    page.locator('[data-series-results]').getByText('Annual', { exact: true }),
  ).toBeVisible();
  await expect(page.getByRole('option', { name: /Annual 1/ })).toBeVisible();
  await page
    .getByRole('navigation', { name: 'Boxes containing this series' })
    .getByRole('link')
    .click();
  await expect(page).toHaveURL(/\/boxes\/1\?series=\d+$/);
  await expect(
    page.getByRole('heading', { name: 'Alpha Adventures', exact: true }),
  ).toHaveCount(0);
  await expect(page.locator('h2')).toHaveCount(1);
  await page
    .getByRole('link', { name: 'Show all comics in this box', exact: true })
    .click();
  await expect(page).toHaveURL(/\/boxes\/1$/);
});

test('legacy HTML notes render as readable text without running scripts', async ({
  page,
}) => {
  const url = await seedComic(
    page,
    '<p>First &amp; second</p><p>Next line</p><script>window.__notesExecuted = true</script>',
  );
  await page.goto(url);
  await expect(
    page.getByText('First & second Next line', { exact: true }),
  ).toBeVisible();
  expect(
    await page.evaluate(() => Object.hasOwn(window, '__notesExecuted')),
  ).toBe(false);
  await page
    .getByRole('link', { name: 'Edit comic details', exact: true })
    .click();
  await expect(page.getByLabel('Comic notes', { exact: true })).toHaveValue(
    'First & second\n\nNext line',
  );
});

test('advanced title matches save explicitly and leave owned copies intact', async ({
  page,
}) => {
  const providerId = String(Date.now());
  const url = await seedComic(page);
  await page.goto(url);
  await page
    .getByRole('link', { name: /Back to Legacy Polish Browser/ })
    .click();
  await page.getByRole('link', { name: 'Edit series', exact: true }).click();
  await page.getByText('Advanced: provider matches', { exact: true }).click();
  await page.getByLabel('Zap title ID', { exact: true }).fill(providerId);
  await page
    .getByLabel('Comic Vine volume ID', { exact: true })
    .fill(`4050-${providerId}`);
  await page
    .getByRole('checkbox', {
      name: 'Apply these provider matches when saving',
      exact: true,
    })
    .check();
  await page
    .getByRole('button', { name: 'Save series details', exact: true })
    .click();
  await expect(page.getByRole('status')).toHaveText('Series details saved.');
  await page.getByRole('link', { name: 'Edit series', exact: true }).click();
  await page.getByText('Advanced: provider matches', { exact: true }).click();
  await expect(page.getByLabel('Zap title ID', { exact: true })).toHaveValue(
    providerId,
  );
  await expect(
    page.getByLabel('Comic Vine volume ID', { exact: true }),
  ).toHaveValue(`4050-${providerId}`);
  await page.goto(url);
  await expect(
    page.getByRole('link', { name: 'Edit copies', exact: true }),
  ).toBeVisible();
  await expect(page.locator('#price-history')).toContainText('$18.00');
});

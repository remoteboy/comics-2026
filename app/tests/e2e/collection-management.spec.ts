import { expect, test } from '@playwright/test';

// Use separate fixture comics to avoid collisions with existing edit tests.
test('moves an owned group inline and returns to the same title view', async ({
  page,
}) => {
  await page.goto('/collection/2?view=list');
  const moves = page.locator('[data-box-move]').first();
  await moves.locator('summary').click();
  await moves.getByLabel('Move to box', { exact: true }).selectOption('3');
  await moves.getByRole('button', { name: 'Save box', exact: true }).click();
  await expect(page).toHaveURL(/\/collection\/2\?view=list&moved=1$/);
  await expect(page.getByRole('status')).toHaveText('Box updated.');
  await page.goto('/comics/4');
  const move = page.locator('[data-box-move]');
  await move.locator('summary').click();
  await expect(move.getByLabel('Move to box', { exact: true })).toHaveValue(
    '3',
  );
  await move.getByLabel('Move to box', { exact: true }).selectOption('');
  await move.getByRole('button', { name: 'Save box', exact: true }).click();
  await expect(
    page.getByText('Unboxed', { exact: true }).first(),
  ).toBeVisible();
});

test('edits shared details and repairs a missing cover with an upload', async ({
  page,
}) => {
  await page.goto('/comics/6');
  await page
    .getByRole('link', { name: 'Edit comic details', exact: true })
    .click();
  await page
    .getByLabel('Cover name', { exact: true })
    .fill('Restored annual cover');
  await page.getByLabel('Story title', { exact: true }).fill('Annual story');
  await page.getByLabel('Publisher', { exact: true }).fill('New Publisher');
  await page
    .getByLabel('Comic notes', { exact: true })
    .fill('Corrected cover and credits.');
  await page.getByLabel('Creator name', { exact: true }).fill('New Creator');
  await page.getByLabel('Role', { exact: true }).selectOption('cover_artist');
  await page.getByRole('button', { name: 'Add creator', exact: true }).click();
  await page
    .getByLabel('Creator name', { exact: true })
    .nth(1)
    .fill('Second Creator');
  await page.getByLabel('Role', { exact: true }).nth(1).selectOption('writer');
  await page
    .getByLabel('Replace cover image', { exact: true })
    .setInputFiles('tests/fixtures/covers/tiny.png');
  await expect(page.getByRole('status')).toContainText('New cover preview');
  await page
    .getByRole('button', { name: 'Save comic details', exact: true })
    .click();
  await expect(page).toHaveURL(/\/comics\/6\?metadataSaved=1$/);
  await expect(page.getByText('New Publisher', { exact: true })).toBeVisible();
  await expect(page.getByText('New Creator', { exact: true })).toBeVisible();
  const src = await page.locator('img').first().getAttribute('src');
  expect(src).toMatch(/^\/covers\/uploaded-.+\.png$/);
  const response = await page.request.get(src!);
  expect(response.headers()['content-type']).toBe('image/png');
  await page
    .getByRole('link', { name: 'Edit comic details', exact: true })
    .click();
  await expect(page.getByLabel('Story title', { exact: true })).toHaveValue(
    'Annual story',
  );
});

test('invalid upload keeps entered text and a stale metadata form offers reload', async ({
  page,
  context,
}) => {
  await page.goto('/comics/2/edit');
  await page
    .getByLabel('Comic notes', { exact: true })
    .fill('Retain these notes');
  await page.getByLabel('Replace cover image', { exact: true }).setInputFiles({
    name: 'fake.png',
    mimeType: 'image/png',
    buffer: Buffer.from('<html>Not an image</html>'),
  });
  await page
    .getByRole('button', { name: 'Save comic details', exact: true })
    .click();
  await expect(page.getByRole('alert')).toContainText('Choose a JPEG');
  await expect(page.getByLabel('Comic notes', { exact: true })).toHaveValue(
    'Retain these notes',
  );
  const second = await context.newPage();
  await second.goto('/comics/2/edit');
  await second
    .getByLabel('Story title', { exact: true })
    .fill('Concurrent correction');
  await second
    .getByRole('button', { name: 'Save comic details', exact: true })
    .click();
  await expect(second).toHaveURL(/metadataSaved=1$/);
  await page
    .getByRole('button', { name: 'Save comic details', exact: true })
    .click();
  await expect(page.getByRole('alert')).toContainText(
    'changed while you were editing',
  );
  await expect(
    page.getByRole('link', { name: 'Reload latest details' }),
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Save comic details', exact: true }),
  ).toBeDisabled();
});

test('inline moves and multipart metadata saves reject foreign origins', async ({
  request,
}) => {
  const move = await request.post('/api/copies/move', {
    headers: { origin: 'https://other.example' },
    form: {},
  });
  expect(move.status()).toBe(403);
  const edit = await request.post('/comics/6/edit', {
    headers: { origin: 'https://other.example' },
    multipart: { variantName: 'Foreign change' },
  });
  expect(edit.status()).toBe(403);
});

import { expect, test } from '@playwright/test';

test('manual intake saves ownership and Add & Next retains the title and sticky defaults', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/intake?source=manual');
  await page
    .getByLabel('Title name', { exact: true })
    .fill('Browser Intake Test');
  await page.getByLabel('Issue number', { exact: true }).fill('1');
  await page.getByLabel('Cover name', { exact: true }).fill('Cover B');
  await page.getByLabel('Publisher', { exact: true }).fill('Browser Publisher');
  await page.getByLabel('Grade', { exact: true }).fill('8.0');
  await page.getByLabel('Box', { exact: true }).selectOption('3');
  await page.getByLabel('Quantity', { exact: true }).fill('2');
  await page
    .getByLabel('Purchase price per copy (USD)', { exact: true })
    .fill('4.99');
  await page.getByLabel('Purchase date', { exact: true }).fill('2024-02-29');
  await page
    .getByLabel('Manual current value (USD)', { exact: true })
    .fill('10.00');
  await page
    .getByText('Cover photo and title details', { exact: true })
    .click();
  await page
    .getByLabel('Cover photo', { exact: true })
    .setInputFiles('tests/fixtures/covers/tiny.png');
  await expect(
    page.getByText('Cover photo selected. Save to apply.', { exact: true }),
  ).toBeVisible();
  await page.getByLabel('Creator name', { exact: true }).fill('Browser Writer');
  await page.getByLabel('Role', { exact: true }).selectOption('writer');
  await page.getByRole('button', { name: 'Add & Next', exact: true }).click();
  await expect(page).toHaveURL(/\/intake\?.*number=2/);
  await expect(page.getByRole('status')).toContainText('Purchase saved');
  await expect(page.getByLabel('Title name', { exact: true })).toHaveValue(
    'Browser Intake Test',
  );
  await expect(page.getByLabel('Issue number', { exact: true })).toHaveValue(
    '2',
  );
  await expect(page.getByLabel('Grade', { exact: true })).toHaveValue('8.0');
  await expect(page.getByLabel('Box', { exact: true })).toHaveValue('3');
  await expect(
    page.getByLabel('Purchase price per copy (USD)', { exact: true }),
  ).toHaveValue('');
  await page
    .getByLabel('Current value', { exact: true })
    .selectOption('unknown');
  await page
    .getByRole('button', { name: 'Save to collection', exact: true })
    .click();
  await expect(page).toHaveURL(/\/comics\/\d+\?copy=\d+&saved=1&intake=\d+$/);
  await expect(page.getByRole('status')).toHaveText(
    'Saved to your collection.',
  );
  await expect(
    page.getByRole('heading', { name: 'Browser Intake Test #2', exact: true }),
  ).toBeVisible();
});

test('lookup failure offers manual entry without creating catalogue records', async ({
  page,
}) => {
  await page.goto('/intake');
  await page.getByLabel('Title name', { exact: true }).fill('Example Lookup');
  await page.getByRole('button', { name: 'Find titles', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Zap is not configured');
  await page
    .getByRole('link', { name: 'Use manual entry', exact: true })
    .click();
  await expect(page.getByLabel('Title name', { exact: true })).toHaveValue(
    'Example Lookup',
  );
  await expect(
    page.getByRole('button', { name: 'Add & Next', exact: true }),
  ).toBeVisible();
});

test('invalid manual photo retains purchase fields and fractional Add & Next clears the issue number', async ({
  page,
}) => {
  await page.goto('/intake?source=manual&series=3');
  await page.getByLabel('Issue number', { exact: true }).fill('1/2');
  await page.getByLabel('Issue type', { exact: true }).selectOption('annual');
  await page.getByLabel('Purchase date', { exact: true }).fill('2020-07-01');
  await page
    .getByLabel('Purchase price per copy (USD)', { exact: true })
    .fill('2.50');
  await page
    .getByLabel('Manual current value (USD)', { exact: true })
    .fill('0');
  await page
    .getByText('Cover photo and title details', { exact: true })
    .click();
  await page.getByLabel('Cover photo', { exact: true }).setInputFiles({
    name: 'broken.png',
    mimeType: 'image/png',
    buffer: Buffer.from('<html>Not a cover</html>'),
  });
  await page
    .getByRole('button', { name: 'Save to collection', exact: true })
    .click();
  await expect(page.getByRole('alert')).toContainText('Choose a JPEG');
  await expect(page.getByLabel('Purchase date', { exact: true })).toHaveValue(
    '2020-07-01',
  );
  await expect(
    page.getByLabel('Purchase price per copy (USD)', { exact: true }),
  ).toHaveValue('2.50');
  await page.getByRole('button', { name: 'Add & Next', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('Purchase saved');
  await expect(page.getByLabel('Issue number', { exact: true })).toHaveValue(
    '',
  );
  await expect(page.getByLabel('Issue type', { exact: true })).toHaveValue(
    'annual',
  );
});

test('intake and value preview reject foreign-origin writes', async ({
  request,
}) => {
  const intake = await request.post('/intake', {
    headers: { origin: 'https://other.example' },
    multipart: { titleName: 'Foreign change' },
  });
  expect(intake.status()).toBe(403);
  const preview = await request.post('/api/intake/valuation', {
    headers: { origin: 'https://other.example' },
    form: { lookupId: 'fake', coverId: 'fake', grade: '9.4' },
  });
  expect(preview.status()).toBe(403);
});

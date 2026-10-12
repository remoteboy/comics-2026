import type { CopyEditInput } from './copy-edit';
import { parsePurchaseDate } from './purchase-details';

function field(data: FormData, name: string): string {
  const value = data.get(name);
  if (typeof value !== 'string') throw new Error(`Missing ${name}.`);
  return value.trim();
}

function whole(value: string, name: string): number {
  if (!/^\d+$/.test(value)) throw new Error(`${name} must be a whole number.`);
  const number = Number(value);
  if (!Number.isSafeInteger(number)) throw new Error(`${name} is too large.`);
  return number;
}

function cents(value: string, name: string): number | null {
  if (!value) return null;
  if (!/^\d+(?:\.\d{1,2})?$/.test(value))
    throw new Error(
      `${name} must be a positive amount with at most two decimal places.`,
    );
  const [dollars, fraction = ''] = value.split('.');
  const result = Number(dollars) * 100 + Number(fraction.padEnd(2, '0'));
  if (!Number.isSafeInteger(result)) throw new Error(`${name} is too large.`);
  return result;
}

export function parseCopyGrade(value: unknown): number | null {
  if (typeof value !== 'string') throw new Error('Enter a grade.');
  const grade = value.trim();
  if (!grade) return null;
  if (!/^\d{1,2}(?:\.\d)?$/.test(grade))
    throw new Error('Grade must have at most one decimal place.');
  const tenths = Math.round(Number(grade) * 10);
  if (tenths < 1 || tenths > 100)
    throw new Error('Grade must be between 0.1 and 10.0.');
  return tenths;
}

export function copyEditFromForm(
  data: FormData,
  holdingId: number,
): CopyEditInput {
  const grade = parseCopyGrade(data.get('grade'));
  const box = field(data, 'boxId');
  const valueMode = field(data, 'valueMode') as CopyEditInput['valueMode'];
  return {
    requestId: field(data, 'requestId'),
    holdingId,
    expectedVersion: whole(field(data, 'expectedVersion'), 'Edit version'),
    scope: field(data, 'scope') as CopyEditInput['scope'],
    variantId: whole(field(data, 'variantId'), 'Cover'),
    gradeTenths: grade,
    quantity: whole(field(data, 'quantity'), 'Quantity'),
    boxId: box ? whole(box, 'Box') : null,
    purchasePriceCents: cents(field(data, 'purchasePrice'), 'Purchase price'),
    purchaseDate: parsePurchaseDate(field(data, 'purchaseDate')),
    valueMode,
    manualValueCents:
      valueMode === 'manual'
        ? cents(field(data, 'manualValue'), 'Current value')
        : null,
  };
}

/** Access identifies the user; same-origin form checks also protect writes. */
export function isSameOriginForm(request: Request, url: URL): boolean {
  return (
    request.headers.get('origin') === url.origin &&
    request.headers.get('sec-fetch-site') !== 'cross-site' &&
    request.headers.get('content-type')?.split(';')[0].trim() ===
      'application/x-www-form-urlencoded'
  );
}

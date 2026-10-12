import { formatMoney } from '@/lib/format';

/** Validate an explicitly submitted calendar date. */
export function parsePurchaseDate(value: unknown): string | null {
  if (value === null || value === '') return null;
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value))
    throw new Error('Purchase date must be a valid date (YYYY-MM-DD).');
  const [year, month, day] = value.split('-').map(Number);
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  if (year < 1 || month < 1 || month > 12 || day < 1 || day > days[month - 1])
    throw new Error('Purchase date must be a valid calendar date.');
  return value;
}

export function purchaseDetails(copy: {
  purchaseDate: string | null;
  purchasePriceCents: number | null;
}): string {
  const date = copy.purchaseDate;
  const months = [
    'Jan',
    'Feb',
    'Mar',
    'Apr',
    'May',
    'Jun',
    'Jul',
    'Aug',
    'Sep',
    'Oct',
    'Nov',
    'Dec',
  ];
  const purchased = date
    ? `Purchased ${Number(date.slice(8))} ${months[Number(date.slice(5, 7)) - 1]} ${date.slice(0, 4)}`
    : 'Purchase date not recorded';
  const paid =
    copy.purchasePriceCents === null
      ? 'price not recorded'
      : `paid ${formatMoney(copy.purchasePriceCents)} per copy`;
  return `${purchased} · ${paid}`;
}

/** A suggestion only: existing purchase date, then date entered for an existing copy. */
export function suggestedPurchaseDate(copy: {
  purchaseDate: string | null;
  createdAt: string;
}): string {
  if (copy.purchaseDate) return copy.purchaseDate;
  try {
    return parsePurchaseDate(copy.createdAt.slice(0, 10)) ?? '';
  } catch {
    return '';
  }
}

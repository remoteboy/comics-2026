const money = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 2,
});

const integer = new Intl.NumberFormat('en-US');

export function formatMoney(cents: number | null | undefined): string {
  if (cents == null) return '—';
  return money.format(cents / 100);
}

export function formatMoneyDelta(cents: number | null | undefined): string {
  if (cents == null) return '—';
  const formatted = money.format(Math.abs(cents) / 100);
  return cents > 0 ? `+${formatted}` : cents < 0 ? `−${formatted}` : formatted;
}

export function formatInteger(value: number): string {
  return integer.format(value);
}

export function formatGrade(tenths: number | null | undefined): string {
  if (tenths == null) return '—';
  return (tenths / 10).toFixed(1);
}

export function formatPercent(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return '—';
  return `${value > 0 ? '+' : ''}${value.toFixed(1)}%`;
}

const date = new Intl.DateTimeFormat('en-IE', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
});

export function formatLegacyDateTime(value: string | null | undefined): string {
  if (!value) return '—';
  const parsed = new Date(`${value.replace(' ', 'T')}Z`);
  return Number.isNaN(parsed.getTime()) ? value : date.format(parsed);
}

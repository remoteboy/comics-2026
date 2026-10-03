export type UnknownRecord = Record<string, unknown>;

export function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function asRecord(value: unknown): UnknownRecord | null {
  return isRecord(value) ? value : null;
}

export function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

export function asString(value: unknown): string | null {
  if (typeof value === 'string') return value;
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  return null;
}

export function nonEmptyString(value: unknown): string | null {
  const string = asString(value)?.trim();
  return string ? string : null;
}

export function asNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim()) {
    const number = Number(value);
    return Number.isFinite(number) ? number : null;
  }
  return null;
}

export function moneyToCents(value: unknown): number | null {
  const number = asNumber(value);
  return number === null ? null : Math.round(number * 100);
}

export function gradeToTenths(value: unknown): number | null {
  const number = asNumber(value);
  return number === null ? null : Math.round(number * 10);
}

export function booleanFlag(value: unknown): boolean {
  return value === true || value === 1 || value === '1';
}

export function yearFromName(value: string): number | null {
  const match = value.match(/\((\d{4})\)\s*$/);
  return match ? Number(match[1]) : null;
}

export function normalizeIssueType(value: unknown): 'issue' | 'annual' {
  return nonEmptyString(value)?.toLowerCase() === 'annual' ? 'annual' : 'issue';
}

export function normalizeRole(value: string): string {
  const role = value.trim().toLowerCase().replaceAll(' ', '_');
  return role === 'cover' ? 'cover_artist' : role;
}

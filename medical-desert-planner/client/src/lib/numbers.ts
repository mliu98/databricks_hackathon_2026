export function toFiniteNumber(value: unknown, fallback = 0): number {
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function formatNumber(value: unknown, maximumFractionDigits = 0): string {
  return toFiniteNumber(value).toLocaleString(undefined, {
    maximumFractionDigits,
  });
}

export function formatFixed(value: unknown, fractionDigits = 0): string {
  return toFiniteNumber(value).toFixed(fractionDigits);
}

export function formatOptionalFixed(value: unknown, fractionDigits = 0): string {
  if (value == null || value === '') return '—';
  const parsed = toFiniteNumber(value, Number.NaN);
  return Number.isNaN(parsed) ? '—' : parsed.toFixed(fractionDigits);
}

export function toBoolean(value: unknown): boolean {
  return value === true || value === 1 || value === '1' || value === 'true';
}

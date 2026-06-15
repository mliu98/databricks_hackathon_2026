import { describe, expect, it } from 'vitest';
import { formatFixed, formatNumber, formatOptionalFixed, toBoolean, toFiniteNumber } from './numbers';

describe('numeric SQL value helpers', () => {
  it('coerces numeric strings returned by Databricks SQL', () => {
    expect(toFiniteNumber('42.5')).toBe(42.5);
    expect(formatFixed('42.5')).toBe('43');
    expect(formatNumber('1200')).toBe((1200).toLocaleString());
  });

  it('uses a safe fallback for null and invalid values', () => {
    expect(toFiniteNumber(null)).toBe(0);
    expect(toFiniteNumber('not-a-number', 7)).toBe(7);
    expect(formatOptionalFixed(null)).toBe('—');
    expect(formatOptionalFixed('not-a-number')).toBe('—');
  });

  it('coerces SQL boolean strings without treating false as truthy', () => {
    expect(toBoolean(true)).toBe(true);
    expect(toBoolean('true')).toBe(true);
    expect(toBoolean(false)).toBe(false);
    expect(toBoolean('false')).toBe(false);
    expect(toBoolean(null)).toBe(false);
  });
});

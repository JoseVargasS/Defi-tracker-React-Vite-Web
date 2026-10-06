import { describe, it, expect } from 'vitest';
import { compactVol3, formatAxisPrice, formatCountdown, formatPriceForChart, precisionForValue } from '@/lib/chart/priceFormat';

describe('formatPriceForChart', () => {
  it('keeps sub-dollar precision in extended mode', () => {
    expect(formatPriceForChart(0.000123456, true)).toBe('0.000123');
  });

  it('uses 4 decimals between 1 and 10 in extended mode', () => {
    expect(formatPriceForChart(5.123456, true)).toBe('5.1235');
  });

  it('groups thousands', () => {
    expect(formatPriceForChart(1234.5)).toBe('1,234.50');
  });

  it('keeps at least 2 decimals on small prices', () => {
    expect(formatPriceForChart(0.5)).toBe('0.50');
  });
});

describe('formatCountdown', () => {
  it('formats MM:SS under an hour', () => {
    expect(formatCountdown(151_000)).toBe('02:31');
  });

  it('adds hours past 1h', () => {
    expect(formatCountdown(3_661_000)).toBe('1:01:01');
  });

  it('clamps negatives to 00:00', () => {
    expect(formatCountdown(-5_000)).toBe('00:00');
  });
});

describe('precisionForValue', () => {
  it('gives 4 decimals for MACD-sized values', () => {
    expect(precisionForValue(0.0011)).toBe(4);
    expect(precisionForValue(-0.0021)).toBe(4);
  });

  it('floors at 2 and caps at 8', () => {
    expect(precisionForValue(123.4)).toBe(2);
    expect(precisionForValue(0)).toBe(2);
    expect(precisionForValue(Number.NaN)).toBe(2);
    expect(precisionForValue(0.0000000123)).toBe(8);
  });
});

describe('compactVol3', () => {
  it('formats K and M with 3 decimals like the app', () => {
    expect(compactVol3(412318)).toBe('412.318K');
    expect(compactVol3(3346000)).toBe('3.346M');
  });

  it('falls back for small and bad values', () => {
    expect(compactVol3(850)).toBe('850.00');
    expect(compactVol3(Number.NaN)).toBe('-');
  });
});

describe('formatAxisPrice', () => {
  it('matches ref close decimals', () => {
    expect(formatAxisPrice(100.123, 100.123)).toBe('100.123');
    expect(formatAxisPrice(0.0001, 65000)).toBe('0.00');
  });
});

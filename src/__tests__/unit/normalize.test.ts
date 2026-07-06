import { describe, it, expect } from 'vitest';
import {
  normalizeKline,
  compactNumber,
  type KlineRaw,
} from '@/lib/chart/normalize';

describe('normalizeKline', () => {
  it('converts raw kline array to Candle object', () => {
    const kline: KlineRaw = [
      1700000000000,
      '100.5',
      '110.3',
      '99.8',
      '105.2',
      '1500.75',
      1700000000000,
      '300000.5',
      5000,
      '200.1',
      '300.2',
      '0.1',
    ];

    const candle = normalizeKline(kline);

    expect(candle.x).toBe(1700000000000);
    expect(candle.o).toBeCloseTo(100.5);
    expect(candle.h).toBeCloseTo(110.3);
    expect(candle.l).toBeCloseTo(99.8);
    expect(candle.c).toBeCloseTo(105.2);
    expect(candle.v).toBeCloseTo(1500.75);
    expect(candle.q).toBeCloseTo(300000.5);
  });

  it('handles zero volume gracefully', () => {
    const kline: KlineRaw = [
      1700000000000,
      '50',
      '55',
      '45',
      '52',
      '0',
      1700000000000,
      '0',
      0,
      '',
      '',
      '',
    ];

    const candle = normalizeKline(kline);

    expect(candle.v).toBe(0);
    expect(candle.q).toBe(0);
  });
});

describe('compactNumber', () => {
  it('returns "-" for NaN', () => {
    expect(compactNumber(NaN)).toBe('-');
    expect(compactNumber('not-a-number')).toBe('-');
  });

  it('returns "-" for non-finite values', () => {
    expect(compactNumber(Infinity)).toBe('-');
    expect(compactNumber(-Infinity)).toBe('-');
  });

  it('returns compact formatted for large numbers', () => {
    expect(compactNumber(0)).toBe('0');
    expect(compactNumber(500)).toBe('500');
    expect(compactNumber(999)).toBe('999');
    expect(compactNumber(1000)).toBe('1K');
    expect(compactNumber(1500)).toBe('1.5K');
    expect(compactNumber(1000000)).toBe('1M');
    expect(compactNumber(2500000000)).toBe('2.5B');
    expect(compactNumber(999_500_000_000)).toBe('999.5B');
  });
});

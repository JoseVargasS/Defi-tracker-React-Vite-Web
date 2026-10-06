import { describe, it, expect } from 'vitest';
import { calculateRsi, rsiMaOf, toCandleList, type CandleData } from '@/lib/chart/rsi';

function candlesFromCloses(closes: number[]): CandleData[] {
  return closes.map((close, i) => ({
    time: (i + 1) * 60_000,
    open: close,
    high: close + 1,
    low: close - 1,
    close,
    volume: 100,
  }));
}

describe('calculateRsi', () => {
  it('returns empty when not enough candles', () => {
    expect(calculateRsi(candlesFromCloses([1, 2, 3]), 14)).toEqual([]);
  });

  it('returns 100 for a pure uptrend', () => {
    const candles = candlesFromCloses(Array.from({ length: 20 }, (_, i) => 100 + i));
    const rsi = calculateRsi(candles, 14);
    expect(rsi).toHaveLength(20);
    expect(rsi.slice(14).every((v) => v === 100)).toBe(true);
  });

  it('stays aligned to candle count with zero prefix', () => {
    const candles = candlesFromCloses(Array.from({ length: 30 }, (_, i) => 100 + Math.sin(i) * 5));
    const rsi = calculateRsi(candles, 14);
    expect(rsi).toHaveLength(30);
    expect(rsi.slice(0, 14).every((v) => v === 0)).toBe(true);
  });
});

describe('rsiMaOf', () => {
  it('returns copy when shorter than period', () => {
    expect(rsiMaOf([1, 2, 3], 14)).toEqual([1, 2, 3]);
  });

  it('averages the last period values', () => {
    const out = rsiMaOf([10, 20, 30, 40], 2);
    expect(out[3]).toBe(35);
  });
});

describe('toCandleList', () => {
  it('skips rows without time', () => {
    const rows = [
      [0, 1, 2, 1, 1.5, 10],
      [1700000000000, '100', '110', '90', '105', '1000'],
    ];
    expect(toCandleList(rows)).toHaveLength(1);
    expect(toCandleList(rows)[0]?.close).toBe(105);
  });
});

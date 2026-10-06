import { describe, it, expect } from 'vitest';
import { calculateMacd } from '@/lib/chart/macd';
import type { CandleData } from '@/lib/chart/rsi';

function uptrend(n: number): CandleData[] {
  return Array.from({ length: n }, (_, i) => ({
    time: (i + 1) * 60_000,
    open: 100 + i,
    high: 101 + i,
    low: 99 + i,
    close: 100 + i,
    volume: 100,
  }));
}

describe('calculateMacd', () => {
  it('returns empty when not enough candles', () => {
    expect(calculateMacd(uptrend(10))).toEqual({ dif: [], dea: [], hist: [] });
  });

  it('aligns dif/dea/hist from slow+signal-1 on', () => {
    const macd = calculateMacd(uptrend(60));
    expect(macd.dif[0]?.[0]).toBe(26 + 9 - 2);
    expect(macd.dif).toHaveLength(macd.dea.length);
    expect(macd.dea).toHaveLength(macd.hist.length);
  });

  it('hist equals twice dif minus dea', () => {
    const macd = calculateMacd(uptrend(60));
    for (const [i, h] of macd.hist) {
      const d = macd.dif.find(([idx]) => idx === i)?.[1] ?? NaN;
      const s = macd.dea.find(([idx]) => idx === i)?.[1] ?? NaN;
      expect(h).toBeCloseTo(2 * (d - s), 10);
    }
  });
});

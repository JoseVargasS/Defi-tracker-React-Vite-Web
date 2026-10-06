import { describe, it, expect } from 'vitest';
import { calculateRsi } from '@/lib/chart/rsi';
import {
  detectRsiDivergences,
  mergeConfirmedAndEarly,
  type RsiDiv,
} from '@/lib/chart/rsiDiv';

describe('detectRsiDivergences', () => {
  it('returns empty on mismatched lengths', () => {
    expect(detectRsiDivergences([], [1, 2])).toEqual([]);
  });

  it('finds divergences sorted by second pivot', () => {
    const closes = Array.from({ length: 80 }, (_, i) => 100 + Math.sin(i / 4) * 10 - i * 0.15);
    const candles = closes.map((close, i) => ({
      time: (i + 1) * 60_000,
      open: close,
      high: close + 2,
      low: close - 2,
      close,
      volume: 100,
    }));
    const rsi = calculateRsi(candles, 14);
    const divs = detectRsiDivergences(candles, rsi);
    const idx2 = divs.map((d) => d.idx2);
    expect(idx2).toEqual([...idx2].sort((a, b) => a - b));
  });
});

describe('mergeConfirmedAndEarly', () => {
  const confirmed: RsiDiv[] = [{ idx1: 10, idx2: 20, rsi1: 30, rsi2: 35, kind: 'REG_BULL' }];

  it('drops early signals duplicating a confirmed event', () => {
    const early: RsiDiv[] = [{ idx1: 11, idx2: 21, rsi1: 31, rsi2: 36, kind: 'REG_BULL' }];
    const merged = mergeConfirmedAndEarly(confirmed, early);
    expect(merged).toHaveLength(1);
    expect(merged[0]?.early).toBeUndefined();
  });

  it('keeps early signals of another kind', () => {
    const early: RsiDiv[] = [{ idx1: 5, idx2: 50, rsi1: 70, rsi2: 65, kind: 'REG_BEAR', early: true }];
    const merged = mergeConfirmedAndEarly(confirmed, early);
    expect(merged).toHaveLength(2);
    expect(merged[1]?.early).toBe(true);
  });
});

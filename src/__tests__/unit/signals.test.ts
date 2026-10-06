import { describe, it, expect } from 'vitest';
import { detectFvgTap, detectMaWickRejection, detectSignals, detectSweepReclaim } from '@/lib/chart/signals';
import type { CandleData } from '@/lib/chart/rsi';

function flat(n: number, price = 100): CandleData[] {
  return Array.from({ length: n }, (_, i) => ({
    time: (i + 1) * 60_000, open: price, high: price + 0.5, low: price - 0.5, close: price, volume: 100,
  }));
}

describe('signals on flat market', () => {
  it('returns null without structure', () => {
    const candles = flat(80);
    expect(detectMaWickRejection(candles)).toBeNull();
    expect(detectFvgTap(candles)).toBeNull();
    expect(detectSweepReclaim(candles)).toBeNull();
    expect(detectSignals(candles)).toEqual([]);
  });

  it('needs minimum candles', () => {
    expect(detectMaWickRejection(flat(10))).toBeNull();
    expect(detectFvgTap(flat(5))).toBeNull();
    expect(detectSweepReclaim(flat(5))).toBeNull();
  });
});

describe('sweep reclaim', () => {
  it('detects bearish sweep over prior high', () => {
    const candles = flat(60);
    const idx = candles.length - 2;
    candles[idx] = { ...candles[idx]!, high: 200, low: 99, open: 100, close: 99.5 };
    const sig = detectSweepReclaim(candles);
    expect(sig?.kind).toBe('SWEEP_BEAR');
    expect(sig?.bullish).toBe(false);
  });
});

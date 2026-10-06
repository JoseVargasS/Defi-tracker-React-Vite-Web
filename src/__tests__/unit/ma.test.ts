import { describe, it, expect } from 'vitest';
import { alignExtraMa, computeMaLines, emaOf, resolveHtfColor, smaOf, stackTagCenters, type MaConfig } from '@/lib/chart/ma';
import type { CandleData } from '@/lib/chart/rsi';

function candles(n: number, stepMs = 60_000, startClose = 100): CandleData[] {
  return Array.from({ length: n }, (_, i) => ({
    time: (i + 1) * stepMs,
    open: startClose + i,
    high: startClose + i + 1,
    low: startClose + i - 1,
    close: startClose + i,
    volume: 100,
  }));
}

function ma(over: Partial<MaConfig> = {}): MaConfig {
  return {
    id: 'ma-1', type: 'SMA', period: 5, color: '#fff', width: 1, visible: true, timeframe: 'chart',
    ...over,
  };
}

describe('smaOf/emaOf', () => {
  it('starts at period-1 index', () => {
    expect(smaOf([1, 2, 3, 4], 2)[0]).toEqual({ index: 1, value: 1.5 });
    expect(emaOf([1, 2, 3, 4], 2)[0]).toEqual({ index: 1, value: 1.5 });
  });

  it('returns empty when shorter than period', () => {
    expect(smaOf([1, 2], 5)).toEqual([]);
    expect(emaOf([1, 2], 5)).toEqual([]);
  });
});

describe('alignExtraMa', () => {
  it('maps other-TF values forward by time', () => {
    const chart = candles(10);
    const extra = candles(5, 120_000);
    const out = alignExtraMa(chart, ma({ period: 3 }), extra);
    expect(out).not.toBeNull();
    expect(out!.every((p) => chart.some((c) => c.time === p.time))).toBe(true);
  });

  it('returns null without enough extra candles', () => {
    expect(alignExtraMa(candles(10), ma({ period: 50 }), candles(5))).toBeNull();
  });
});

describe('computeMaLines', () => {
  it('dedupes same type-period-tf keeping chart TF', () => {
    const chart = candles(30);
    const out = computeMaLines(chart, '1h', [
      ma({ id: 'a', period: 5, timeframe: 'chart' }),
      ma({ id: 'b', period: 5, timeframe: 'chart' }),
    ], new Map());
    expect(Object.keys(out)).toEqual(['a']);
  });

  it('skips hidden dupes without blocking visible ones', () => {
    const chart = candles(30);
    const out = computeMaLines(chart, '1h', [
      ma({ id: 'hidden', period: 5, visible: false }),
      ma({ id: 'shown', period: 5, visible: true }),
    ], new Map());
    expect(Object.keys(out).sort()).toEqual(['hidden', 'shown']);
  });

  it('aligns other-TF MAs from extras', () => {
    const chart = candles(30);
    const extras = new Map([['5m', candles(30, 300_000)]]);
    const out = computeMaLines(chart, '1h', [ma({ id: 'htf', period: 5, timeframe: '5m' })], extras);
    expect(out.htf?.length).toBeGreaterThan(0);
  });
});

describe('stackTagCenters', () => {
  it('keeps spaced tags in place', () => {
    expect(stackTagCenters([100, 200, 300], 20, 4, 0, 500)).toEqual([100, 200, 300]);
  });

  it('pushes colliding tags down with gap', () => {
    const out = stackTagCenters([100, 105, 110], 20, 4, 0, 500);
    expect(out[1]! - out[0]!).toBeGreaterThanOrEqual(24);
    expect(out[2]! - out[1]!).toBeGreaterThanOrEqual(24);
  });

  it('shifts everything up on bottom overflow without collisions', () => {
    const out = stackTagCenters([480, 485, 490], 20, 4, 0, 500);
    expect(Math.max(...out) + 10).toBeLessThanOrEqual(500);
    const sorted = [...out].sort((a, b) => a - b);
    expect(sorted[1]! - sorted[0]!).toBeGreaterThanOrEqual(24);
    expect(sorted[2]! - sorted[1]!).toBeGreaterThanOrEqual(24);
  });

  it('clamps tags above the top', () => {
    const out = stackTagCenters([-50, 10], 20, 4, 10, 490);
    expect(Math.min(...out) - 10).toBeGreaterThanOrEqual(0);
  });
});

describe('resolveHtfColor', () => {
  it('uses the custom color when personalized', () => {
    expect(resolveHtfColor({ color: '#ff0000', customColor: true })).toBe('#ff0000');
  });

  it('falls back to bone white', () => {
    expect(resolveHtfColor({ color: '#00BCD4' })).toBe('#f0eeeb');
    expect(resolveHtfColor({})).toBe('#f0eeeb');
  });
});

import { describe, it, expect } from 'vitest';
import { analyzePulse, detectSrZones, fmtPulsePrice, maMatrixScore } from '@/lib/chart/analysis';
import type { CandleData } from '@/lib/chart/rsi';

function trend(n: number): CandleData[] {
  return Array.from({ length: n }, (_, i) => ({
    time: (i + 1) * 60_000, open: 100 + i, high: 102 + i, low: 99 + i, close: 101 + i, volume: 100,
  }));
}

describe('analyzePulse', () => {
  it('returns null on short series', () => {
    expect(analyzePulse(trend(30), '1h', new Map())).toBeNull();
  });

  it('scores a clean uptrend', () => {
    const pulse = analyzePulse(trend(200), '1h', new Map());
    expect(pulse).not.toBeNull();
    expect(pulse!.items).toHaveLength(5);
    expect(['BULLISH', 'BEARISH', 'NEUTRAL']).toContain(pulse!.bias);
    expect(pulse!.headline.length).toBeGreaterThan(0);
  });

  it('uses htf closes for the matrix', () => {
    const closes = trend(250).map((c) => c.close);
    const pulse = analyzePulse(trend(200), '1h', new Map([
      ['15m', closes], ['1h', closes], ['4h', closes],
    ]));
    expect(pulse?.items.find((i) => i.id === 'ma200')?.detail).toContain('15m');
  });
});

describe('helpers', () => {
  it('formats pulse prices', () => {
    expect(fmtPulsePrice(1234.56)).toBe('1,234.6');
    expect(fmtPulsePrice(5.12345)).toBe('5.1235');
    expect(fmtPulsePrice(NaN)).toBe('--');
  });

  it('scores ma matrix votes', () => {
    const closes = trend(250).map((c) => c.close);
    const m = maMatrixScore(new Map([['15m', closes], ['1h', closes], ['4h', closes]]), '1h', closes, closes.at(-1)!);
    expect(m.bullVotes).toBeGreaterThan(m.bearVotes);
    expect(m.perTf).toHaveLength(3);
  });

  it('detects sr zones array', () => {
    expect(Array.isArray(detectSrZones(trend(160)))).toBe(true);
    expect(detectSrZones(trend(10))).toEqual([]);
  });
});

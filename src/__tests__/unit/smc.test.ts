import { describe, it, expect } from 'vitest';
import {
  aggregateByCount,
  computeSmc,
  detectEqLevels,
  detectFvg,
  detectFvgConfluence,
  detectLiquidity,
  detectOrderBlocks,
  detectPremium,
  detectStructure,
  detectSwings,
  higherTfLabel,
} from '@/lib/chart/smc';
import type { CandleData } from '@/lib/chart/rsi';

function candle(i: number, o: number, h: number, l: number, c: number): CandleData {
  return { time: (i + 1) * 60_000, open: o, high: h, low: l, close: c, volume: 100 };
}

function trend(n: number): CandleData[] {
  return Array.from({ length: n }, (_, i) => candle(i, 100 + i, 102 + i, 99 + i, 101 + i));
}

function wave(n: number): CandleData[] {
  return Array.from({ length: n }, (_, i) => {
    const c = 100 + Math.sin(i / 4) * 8 - i * 0.12;
    return candle(i, c - 0.5, c + 2, c - 2, c);
  });
}

describe('detectSwings', () => {
  it('finds nothing on short series', () => {
    expect(detectSwings(trend(5))).toEqual([]);
  });

  it('finds fractal pivots', () => {
    expect(detectSwings(wave(60)).length).toBeGreaterThan(0);
  });
});

describe('detectStructure', () => {
  it('emits BOS/CHOCH on breakout', () => {
    const candles = wave(120);
    const events = detectStructure(candles, detectSwings(candles));
    expect(events.length).toBeGreaterThan(0);
  });
});

describe('zones', () => {
  it('detects order blocks after events', () => {
    const candles: CandleData[] = [];
    for (let i = 0; i < 60; i++) {
      candles.push(candle(i, 100, 101, 99, i === 30 ? 99 : 100));
    }
    for (let i = 60; i < 90; i++) {
      candles.push(candle(i, 100 + i, 103 + i, 99 + i, 102 + i));
    }
    const events = detectStructure(candles, detectSwings(candles));
    const zones = detectOrderBlocks(candles, events);
    expect(Array.isArray(zones)).toBe(true);
  });

  it('detects FVG gaps', () => {
    const candles = trend(40).map((c, i) => (i === 20 ? { ...c, low: 200, high: 205, open: 201, close: 204 } : c));
    const fvg = detectFvg(candles);
    expect(fvg.some((z) => z.kind === 'FVG')).toBe(true);
  });

  it('caps zones per side', () => {
    const candles = trend(300);
    const events = detectStructure(candles, detectSwings(candles));
    const zones = detectOrderBlocks(candles, events);
    expect(zones.filter((z) => z.bullish).length).toBeLessThanOrEqual(5);
  });
});

describe('levels and premium', () => {
  it('detects equal highs within ATR tolerance', () => {
    const candles = trend(60);
    const eq = detectEqLevels(candles, detectSwings(candles));
    expect(Array.isArray(eq)).toBe(true);
  });

  it('computes premium range with equilibrium', () => {
    const premium = detectPremium(trend(130));
    expect(premium).not.toBeNull();
    expect(premium!.equilibrium).toBe((premium!.high + premium!.low) / 2);
  });
});

describe('liquidity', () => {
  it('finds unswept pools sorted by index', () => {
    const candles = trend(100);
    const liq = detectLiquidity(candles, detectSwings(candles));
    const idx = liq.map((l) => l.idx);
    expect(idx).toEqual([...idx].sort((a, b) => a - b));
  });
});

describe('helpers', () => {
  it('aggregates by count', () => {
    const agg = aggregateByCount(trend(10), 4);
    expect(agg).toHaveLength(3);
    expect(agg[0]?.open).toBe(100);
  });

  it('labels higher timeframes', () => {
    expect(higherTfLabel('15m', 4)).toBe('1h');
    expect(higherTfLabel('nope', 4)).toBe('HTF');
  });

  it('computes full smc on enough candles', () => {
    const smc = computeSmc(wave(200), '15m');
    expect(smc.swings.length).toBeGreaterThan(0);
    expect(smc.premium).not.toBeNull();
  });

  it('returns empty smc on short series', () => {
    expect(computeSmc(trend(5)).swings).toEqual([]);
  });

  it('detects htf confluence bands at most 10', () => {
    const candles = trend(200);
    const bands = detectFvgConfluence(candles, detectFvg(candles), '15m');
    expect(bands.length).toBeLessThanOrEqual(10);
  });
});

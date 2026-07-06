import { describe, it, expect } from 'vitest';
import {
  calculateVolume,
  calculateBollingerBands,
  calculateStochRSI,
  calculateVolumeProfile,
  CHART_THEME,
} from '@/lib/chart/indicators';
import type { Candle } from '@/lib/chart/normalize';

function makeCandle(
  index: number,
  close: number,
): Candle {
  return {
    x: index,
    o: close - 1,
    h: close + 1,
    l: close - 1,
    c: close,
    v: 100,
    q: 1000,
  };
}

describe('calculateVolume', () => {
  it('returns correct volume data with up/down colors', () => {
    const candles: Candle[] = [
      { x: 1, o: 10, h: 15, l: 5, c: 15, v: 100, q: 1000 },
      { x: 2, o: 15, h: 20, l: 10, c: 10, v: 200, q: 2000 },
    ];

    const vol = calculateVolume(candles);

    expect(vol).toHaveLength(2);
    expect(vol[0]).toEqual({
      x: 1,
      y: 100,
      q: 1000,
      color: CHART_THEME.up,
    });
    expect(vol[1]).toEqual({
      x: 2,
      y: 200,
      q: 2000,
      color: CHART_THEME.down,
    });
  });
});

describe('calculateBollingerBands', () => {
  it('returns correct upper/middle/lower bands for simple price data', () => {
    const candles = Array.from({ length: 10 }, (_, i) =>
      makeCandle(i, i + 1),
    );
    const bands = calculateBollingerBands(candles, 3, 2);

    expect(bands.upper).toHaveLength(10);
    expect(bands.middle).toHaveLength(10);
    expect(bands.lower).toHaveLength(10);

    // First 2 entries have null y (i < period - 1)
    expect(bands.middle[0]!.y).toBeNull();
    expect(bands.middle[1]!.y).toBeNull();

    // i=2: sma = (1+2+3)/3 = 2, variance = 2/3
    const deviation = Math.sqrt(2 / 3);
    expect(bands.middle[2]!.y).toBeCloseTo(2, 5);
    expect(bands.upper[2]!.y).toBeCloseTo(2 + deviation * 2, 5);
    expect(bands.lower[2]!.y).toBeCloseTo(2 - deviation * 2, 5);

    // i=3: sma = (2+3+4)/3 = 3
    expect(bands.middle[3]!.y).toBeCloseTo(3, 5);
    expect(bands.upper[3]!.y).toBeCloseTo(3 + deviation * 2, 5);
    expect(bands.lower[3]!.y).toBeCloseTo(3 - deviation * 2, 5);

    // i=4: sma = (3+4+5)/3 = 4
    expect(bands.middle[4]!.y).toBeCloseTo(4, 5);
  });

  it('returns all null for insufficient data', () => {
    const candles = Array.from({ length: 2 }, (_, i) =>
      makeCandle(i, i + 1),
    );
    const bands = calculateBollingerBands(candles, 5, 2);

    expect(bands.upper).toHaveLength(2);
    expect(bands.upper.every((p) => p.y === null)).toBe(true);
  });
});

describe('calculateStochRSI', () => {
  // Build 40 candles with varying prices to ensure enough data
  const prices = [
    1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20,
    19, 18, 17, 16, 15, 14, 13, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22,
    23, 24,
  ];
  const candles: Candle[] = prices.map((c, i) => makeCandle(i, c));

  it('returns K and D arrays with correct length', () => {
    const result = calculateStochRSI(candles, 14, 14, 3, 3);

    expect(result.k).toHaveLength(candles.length);
    expect(result.d).toHaveLength(candles.length);
  });

  it('returns null for early entries (insufficient data)', () => {
    const result = calculateStochRSI(candles, 14, 14, 3, 3);

    for (let i = 0; i < 20; i++) {
      expect(result.k[i]!.y).toBeNull();
      expect(result.d[i]!.y).toBeNull();
    }
  });

  it('returns valid K and D values for later entries', () => {
    const result = calculateStochRSI(candles, 14, 14, 3, 3);

    // Last few entries should have valid K and D values
    const lastK = result.k[result.k.length - 1]!.y;
    const lastD = result.d[result.d.length - 1]!.y;

    expect(lastK).not.toBeNull();
    expect(lastD).not.toBeNull();
    expect(lastK!).toBeGreaterThanOrEqual(0);
    expect(lastK!).toBeLessThanOrEqual(100);
    expect(lastD!).toBeGreaterThanOrEqual(0);
    expect(lastD!).toBeLessThanOrEqual(100);
  });
});

describe('calculateVolumeProfile', () => {
  it('returns correct structure with rows, poc, and maxVolume', () => {
    const candles: Candle[] = [
      { x: 1, o: 10, h: 20, l: 5, c: 15, v: 100, q: 1000 },
      { x: 2, o: 15, h: 25, l: 10, c: 20, v: 200, q: 2000 },
      { x: 3, o: 20, h: 30, l: 15, c: 10, v: 300, q: 3000 },
      { x: 4, o: 10, h: 20, l: 5, c: 18, v: 150, q: 1500 },
      { x: 5, o: 18, h: 28, l: 12, c: 25, v: 250, q: 2500 },
    ];

    const result = calculateVolumeProfile(candles, 48);

    expect(Array.isArray(result.rows)).toBe(true);
    expect(result.rows.length).toBe(48);
    expect(result.poc).not.toBeNull();
    expect(result.maxVolume).toBeGreaterThan(0);

    // Each row has the expected fields
    for (const row of result.rows) {
      expect(row).toHaveProperty('low');
      expect(row).toHaveProperty('high');
      expect(row).toHaveProperty('price');
      expect(row).toHaveProperty('up');
      expect(row).toHaveProperty('down');
      expect(row).toHaveProperty('total');
      expect(row.low).toBeLessThan(row.high);
    }

    // poc matches the row with max total
    const maxRow = result.rows.reduce((best, r) =>
      r.total > best.total ? r : best,
    );
    expect(result.poc).toBe(maxRow);
    expect(result.maxVolume).toBe(maxRow.total);
  });

  it('returns empty result for empty input', () => {
    const result = calculateVolumeProfile([], 48);
    expect(result.rows).toEqual([]);
    expect(result.poc).toBeNull();
    expect(result.maxVolume).toBe(0);
  });
});

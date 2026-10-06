import { describe, it, expect } from 'vitest';
import {
  decodeFibOverlays,
  encodeFibOverlays,
  fibLevelPrice,
  hexWithAlpha,
  hitFibOverlay,
  levelsSorted,
  pointToSegmentPx,
  timeToIndex,
  trimRatio,
  type FibOverlay,
} from '@/lib/chart/fib';
import { decodeDrawOverlays, drawKindLabel, encodeDrawOverlays, type DrawOverlay } from '@/lib/chart/draw';
import type { CandleData } from '@/lib/chart/rsi';

function fib(): FibOverlay {
  return {
    id: 'f1',
    start: { time: 1000, price: 100 },
    end: { time: 2000, price: 200 },
    colorHex: '#FFFFFF',
    width: 1,
    enabledLevels: [0, 0.5, 0.618, 1],
    hidden: false,
    locked: false,
  };
}

describe('fib', () => {
  it('prices levels agnostic to direction', () => {
    expect(fibLevelPrice(100, 200, 0.5)).toBe(150);
    expect(fibLevelPrice(200, 100, 0.5)).toBe(150);
  });

  it('anchors ratio 0 at the end point like the app', () => {
    expect(fibLevelPrice(110, 100, 0)).toBe(110);
    expect(fibLevelPrice(110, 100, 1)).toBe(100);
  });

  it('trims ratios tradingview style', () => {
    expect(trimRatio(0)).toBe('0');
    expect(trimRatio(1)).toBe('1');
    expect(trimRatio(0.618)).toBe('.618');
    expect(trimRatio(0.5)).toBe('.5');
    expect(trimRatio(0.236)).toBe('.236');
    expect(trimRatio(1.272)).toBe('1.272');
    expect(trimRatio(NaN)).toBe('0');
  });

  it('sorts enabled levels within known set', () => {
    expect(levelsSorted({ ...fib(), enabledLevels: [1, 0.5, 99] })).toEqual([0.5, 1]);
  });

  it('round-trips encode/decode', () => {
    expect(decodeFibOverlays(encodeFibOverlays([fib()]))).toEqual([fib()]);
  });

  it('drops malformed entries and caps at 10', () => {
    expect(decodeFibOverlays('bad')).toEqual([]);
    expect(decodeFibOverlays(null)).toEqual([]);
    const many = Array.from({ length: 12 }, (_, i) => ({ ...fib(), id: `f${i}` }));
    expect(decodeFibOverlays(encodeFibOverlays(many))).toHaveLength(10);
  });

  it('maps time to nearest index', () => {
    const candles: CandleData[] = [1, 2, 3, 4, 5].map((t) => ({
      time: t * 1000, open: 1, high: 2, low: 0.5, close: 1.5, volume: 10,
    }));
    expect(timeToIndex(candles, 3100)).toBe(2);
    expect(timeToIndex([], 1000)).toBe(0);
  });
});

describe('fib hit testing', () => {
  const overlay: FibOverlay = {
    ...fib(),
    start: { time: 1000, price: 100 },
    end: { time: 2000, price: 200 },
  };

  it('measures point to segment distance', () => {
    expect(pointToSegmentPx(5, 0, 0, 0, 10, 0)).toBe(0);
    expect(pointToSegmentPx(5, 3, 0, 0, 10, 0)).toBe(3);
    expect(pointToSegmentPx(20, 0, 0, 0, 10, 0)).toBe(10);
  });

  it('hits lines within tolerance', () => {
    // nivel 0.5 -> 150 en y=150 con escala 1:1
    const hit = hitFibOverlay([overlay], { x: 1500, y: 150 }, (t) => t, (p) => p, 8);
    expect(hit?.id).toBe('f1');
  });

  it('misses far away', () => {
    expect(hitFibOverlay([overlay], { x: 1500, y: 10 }, (t) => t, (p) => p, 8)).toBeNull();
  });

  it('skips hidden overlays', () => {
    expect(hitFibOverlay([{ ...overlay, hidden: true }], { x: 1500, y: 150 }, (t) => t, (p) => p, 8)).toBeNull();
  });

  it('dims hex colors with alpha', () => {
    expect(hexWithAlpha('#FFFFFF', 0.35)).toBe('rgba(255,255,255,0.35)');
    expect(hexWithAlpha('nope', 0.35)).toBeNull();
  });
});

describe('draw', () => {
  function draw(): DrawOverlay {
    return {
      id: 'd1', kind: 'SEGMENT',
      start: { time: 1000, price: 100 },
      end: { time: 2000, price: 200 },
      colorHex: '#FFD60A', width: 1, hidden: false, locked: true,
    };
  }

  it('round-trips encode/decode', () => {
    expect(decodeDrawOverlays(encodeDrawOverlays([draw()]))).toEqual([draw()]);
  });

  it('rejects unknown kinds and caps at 20', () => {
    expect(decodeDrawOverlays('d1;NOPE;1;1;2;2;#fff;1;0;0')).toEqual([]);
    const many = Array.from({ length: 25 }, (_, i) => ({ ...draw(), id: `d${i}` }));
    expect(decodeDrawOverlays(encodeDrawOverlays(many))).toHaveLength(20);
  });

  it('labels kinds in spanish', () => {
    expect(drawKindLabel('SEGMENT')).toBe('Segmento');
    expect(drawKindLabel('PRICE_LINE')).toBe('Línea de precio');
  });
});

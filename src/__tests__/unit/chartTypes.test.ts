import { describe, it, expect } from 'vitest';
import {
  type IndicatorColorKey,
  type IndicatorColors,
  type MaLineConfig,
  type ChartIndicatorsState,
  type MeasureState,
  type MeasurePoint,
  type VolumeProfileSettings,
  type VPRow,
  type VolumeProfileResult,
  type CrosshairState,
  type PartialCrosshairState,
  type ScaleLike,
  type ChartDatasetLike,
} from '@/lib/chart/types';

describe('IndicatorColorKey type', () => {
  it('all color keys are valid strings', () => {
    const keys: IndicatorColorKey[] = [
      'rsi', 'stochK', 'stochD',
      'bbLine', 'bbBasis', 'bbFill', 'stochLevelOver', 'stochLevelUnder',
    ];
    expect(keys).toHaveLength(8);
  });
});

describe('IndicatorColors type', () => {
  it('constructs valid color record', () => {
    const colors: IndicatorColors = {
      rsi: '#0000ff',
      stochK: '#ff00ff',
      stochD: '#ffff00',
      bbLine: '#00ffff',
      bbBasis: '#ffffff',
      bbFill: '#888888',
      stochLevelOver: '#aaa',
      stochLevelUnder: '#bbb',
    };
    expect(colors.rsi).toBe('#0000ff');
    expect(Object.keys(colors)).toHaveLength(8);
  });
});

describe('ChartIndicatorsState type', () => {
  it('constructs valid state', () => {
    const smaLine: MaLineConfig = { id: 'sma-50', period: 50, color: '#00BCD4', enabled: true };
    const emaLine: MaLineConfig = { id: 'ema-200', period: 200, color: '#4CAF50', enabled: false };
    const state: ChartIndicatorsState = {
      bollinger: true,
      volume: false,
      stochRsi: true,
      volumeProfile: false,
      smaLines: [smaLine],
      emaLines: [emaLine],
      rsiEnabled: true,
      rsiPeriod: 14,
      colors: {
        rsi: '#0000ff', stochK: '#ff00ff', stochD: '#ffff00', bbLine: '#00ffff',
        bbBasis: '#ffffff', bbFill: '#888888',
        stochLevelOver: '#aaa', stochLevelUnder: '#bbb',
      },
    };
    expect(state.bollinger).toBe(true);
    expect(state.smaLines[0].period).toBe(50);
    expect(state.rsiPeriod).toBe(14);
  });
});

describe('MeasureState type', () => {
  it('constructs valid state', () => {
    const point: MeasurePoint = { index: 0, x: 100, y: 200 };
    const state: MeasureState = {
      active: true,
      start: point,
      end: null,
      preview: null,
    };
    expect(state.active).toBe(true);
    expect(state.start?.x).toBe(100);
  });
});

describe('VolumeProfileSettings type', () => {
  it('constructs valid settings', () => {
    const settings: VolumeProfileSettings = {
      rows: 20,
      widthRatio: 0.3,
      minWidth: 50,
      maxWidth: 200,
    };
    expect(settings.rows).toBe(20);
  });
});

describe('VPRow type', () => {
  it('constructs valid row', () => {
    const row: VPRow = { low: 100, high: 200, price: 150, up: 50, down: 30, total: 80 };
    expect(row.total).toBe(80);
  });
});

describe('VolumeProfileResult type', () => {
  it('constructs valid result', () => {
    const row: VPRow = { low: 100, high: 200, price: 150, up: 50, down: 30, total: 80 };
    const result: VolumeProfileResult = { rows: [row], poc: row, maxVolume: 80 };
    expect(result.rows).toHaveLength(1);
    expect(result.poc?.price).toBe(150);
  });
});

describe('CrosshairState type', () => {
  it('constructs valid state', () => {
    const state: CrosshairState = {
      x: 100,
      y: 200,
      snapIndex: 5,
      moveListener: null,
      leaveListener: null,
      canvas: null,
    };
    expect(state.x).toBe(100);
    expect(state.snapIndex).toBe(5);
  });
});

describe('PartialCrosshairState type', () => {
  it('constructs valid partial state', () => {
    const state: PartialCrosshairState = { x: 10, y: 20, snapIndex: 3 };
    expect(state.x).toBe(10);
  });
});

describe('ScaleLike type', () => {
  it('constructs valid scale', () => {
    const scale: ScaleLike = {
      top: 0,
      bottom: 400,
      left: 0,
      right: 800,
      options: { display: true },
      getPixelForValue: (v) => v,
      getValueForPixel: (p) => p,
      id: 'price',
    };
    expect(scale.getPixelForValue(100)).toBe(100);
  });
});

describe('ChartDatasetLike type', () => {
  it('constructs valid dataset', () => {
    const dataset: ChartDatasetLike = {
      label: 'candlestick',
      data: [],
      customProp: 'value',
    };
    expect(dataset.label).toBe('candlestick');
  });
});

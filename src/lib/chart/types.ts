import type { Chart } from 'chart.js';

export type IndicatorColorKey =
  | 'sma'
  | 'ema'
  | 'rsi'
  | 'stochK'
  | 'stochD'
  | 'bbLine'
  | 'bbBasis'
  | 'bbFill'
  | 'stochLevelOver'
  | 'stochLevelUnder';

export type IndicatorColors = Record<IndicatorColorKey, string>;

export const SMA_PERIOD_OPTIONS = [40, 50, 75, 100, 150, 200] as const;
export const EMA_PERIOD_OPTIONS = [40, 50, 75, 100, 150, 200] as const;

export interface ChartIndicatorsState {
  bollinger: boolean;
  volume: boolean;
  stochRsi: boolean;
  volumeProfile: boolean;
  smaEnabled: boolean;
  smaPeriod: number;
  emaEnabled: boolean;
  emaPeriod: number;
  rsiEnabled: boolean;
  rsiPeriod: number;
  colors: IndicatorColors;
}

export interface MeasurePoint { index: number; x: number; y: number }

export interface MeasureState {
  active: boolean;
  start: MeasurePoint | null;
  end: MeasurePoint | null;
  preview: MeasurePoint | null;
}

export interface VolumeProfileSettings {
  rows?: number;
  widthRatio?: number;
  minWidth?: number;
  maxWidth?: number;
}

export interface VPRow { low: number; high: number; price: number; up: number; down: number; total: number }
export interface VolumeProfileResult { rows: VPRow[]; poc: VPRow | null; maxVolume: number }

export interface CrosshairState {
  x: number | null;
  y: number | null;
  snapIndex: number | null;
  moveListener: ((e: MouseEvent) => void) | null;
  leaveListener: (() => void) | null;
  canvas: HTMLCanvasElement | null;
}

export type PartialCrosshairState = Pick<CrosshairState, 'x' | 'y' | 'snapIndex'>;

export interface EnhancedChart extends Chart<'candlestick'> {
  _symbol: string;
  _interval: string;
  _fullLastTimestamp: number | null;
  _indicators: ChartIndicatorsState;
  _measure: MeasureState;
  _volumeProfileSettings: VolumeProfileSettings;
  _volumeProfile: VolumeProfileResult | null;
  _pairPrice: number | null;
  _userMovedPan: boolean;
  _visibleCount: number;
  crosshair: CrosshairState;
}

export interface EventfulCanvas extends HTMLCanvasElement {
  _zoomHandler: ((e: WheelEvent) => void) | undefined;
  _downHandler: ((e: PointerEvent) => void) | undefined;
  _moveHandler: ((e: PointerEvent) => void) | undefined;
  _upHandler: ((e: PointerEvent) => void) | undefined;
  _dblClickHandler: ((e: MouseEvent) => void) | undefined;
}

export interface ScaleLike {
  top: number;
  bottom: number;
  left?: number;
  right?: number;
  options?: { display?: boolean };
  getPixelForValue(value: number): number | undefined;
  getValueForPixel?(pixel: number): number | undefined;
  id?: string;
}

export interface ChartDatasetLike { label?: string; data?: unknown[]; [key: string]: unknown }

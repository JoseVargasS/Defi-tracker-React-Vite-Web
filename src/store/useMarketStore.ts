import { create } from 'zustand';
import { DEFAULT_TRACKED_PAIRS } from '@/lib/config';
import { DEFAULT_INDICATOR_COLORS } from '@/lib/chart/indicators';
import type { IndicatorColorKey, MaLineConfig } from '@/lib/chart/types';

export { DEFAULT_INDICATOR_COLORS };

export interface ChartIndicatorsState {
  bollinger: boolean;
  volume: boolean;
  stochRsi: boolean;
  volumeProfile: boolean;
  smaLines: MaLineConfig[];
  emaLines: MaLineConfig[];
  rsiEnabled: boolean;
  rsiPeriod: number;
  colors: Record<IndicatorColorKey, string>;
}

export type ChartMode = 'chartjs' | 'tradingview';

export const DEFAULT_SMA_LINES: MaLineConfig[] = [
  { id: 'sma-9', period: 9, color: '#FF9800', enabled: false },
  { id: 'sma-25', period: 25, color: '#E91E63', enabled: false },
  { id: 'sma-50', period: 50, color: '#00BCD4', enabled: true },
  { id: 'sma-75', period: 75, color: '#E0E0E0', enabled: false },
  { id: 'sma-100', period: 100, color: '#FFEB3B', enabled: false },
  { id: 'sma-200', period: 200, color: '#4CAF50', enabled: true },
];

export const DEFAULT_EMA_LINES: MaLineConfig[] = [
  { id: 'ema-9', period: 9, color: '#FF9800', enabled: false },
  { id: 'ema-12', period: 12, color: '#2196F3', enabled: true },
  { id: 'ema-25', period: 25, color: '#E91E63', enabled: false },
  { id: 'ema-50', period: 50, color: '#00BCD4', enabled: false },
  { id: 'ema-100', period: 100, color: '#FFEB3B', enabled: false },
  { id: 'ema-200', period: 200, color: '#4CAF50', enabled: false },
];

let _smaCounter = DEFAULT_SMA_LINES.length;
let _emaCounter = DEFAULT_EMA_LINES.length;

interface MarketState {
  activeView: 'market' | 'wallet';
  chartMode: ChartMode;
  tracked: string[];
  currentPair: string | null;
  currentInterval: string;
  chartIndicators: ChartIndicatorsState;
  lastPrices: Record<string, number>;
  coinsList: unknown[];

  setActiveView: (view: 'market' | 'wallet') => void;
  setChartMode: (mode: ChartMode) => void;
  setTracked: (pairs: string[]) => void;
  addTracked: (pair: string) => void;
  removeTracked: (pair: string) => void;
  setCurrentPair: (pair: string | null) => void;
  setCurrentInterval: (interval: string) => void;
  setChartIndicator: (key: keyof ChartIndicatorsState, value: boolean) => void;
  setSmaLine: (id: string, updates: Partial<Omit<MaLineConfig, 'id'>>) => void;
  addSmaLine: () => void;
  removeSmaLine: (id: string) => void;
  setEmaLine: (id: string, updates: Partial<Omit<MaLineConfig, 'id'>>) => void;
  addEmaLine: () => void;
  removeEmaLine: (id: string) => void;
  setRsiEnabled: (enabled: boolean) => void;
  setRsiPeriod: (period: number) => void;
  setIndicatorColor: (key: IndicatorColorKey, hex: string) => void;
  setCoinsList: (list: unknown[]) => void;
  setLastPrice: (symbol: string, price: number) => void;
}

export const useMarketStore = create<MarketState>((set) => ({
  activeView: 'market',
  chartMode: 'tradingview',
  tracked: [...DEFAULT_TRACKED_PAIRS],
  currentPair: null,
  currentInterval: '1d',
  chartIndicators: {
    bollinger: true,
    volume: true,
    stochRsi: true,
    volumeProfile: true,
    smaLines: DEFAULT_SMA_LINES.map(l => ({ ...l })),
    emaLines: DEFAULT_EMA_LINES.map(l => ({ ...l })),
    rsiEnabled: false,
    rsiPeriod: 14,
    colors: { ...DEFAULT_INDICATOR_COLORS },
  },
  lastPrices: {},
  coinsList: [],

  setActiveView: (view) => set({ activeView: view }),
  setChartMode: (mode) => set({ chartMode: mode }),
  setTracked: (pairs) => set({ tracked: pairs }),
  addTracked: (pair) =>
    set((state) => ({
      tracked: state.tracked.includes(pair)
        ? state.tracked
        : [...state.tracked, pair],
    })),
  removeTracked: (pair) =>
    set((state) => ({
      tracked: state.tracked.filter((p) => p !== pair),
    })),
  setCurrentPair: (pair) => set({ currentPair: pair }),
  setCurrentInterval: (interval) => set({ currentInterval: interval }),
  setChartIndicator: (key, value) =>
    set((state) => ({
      chartIndicators: { ...state.chartIndicators, [key]: value },
    })),
  setSmaLine: (id, updates) =>
    set((state) => ({
      chartIndicators: {
        ...state.chartIndicators,
        smaLines: state.chartIndicators.smaLines.map((l) =>
          l.id === id ? { ...l, ...updates } : l
        ),
      },
    })),
  addSmaLine: () =>
    set((state) => {
      _smaCounter++;
      return {
        chartIndicators: {
          ...state.chartIndicators,
          smaLines: [...state.chartIndicators.smaLines, { id: `sma-${_smaCounter}`, period: 50, color: '#00BCD4', enabled: true }],
        },
      };
    }),
  removeSmaLine: (id) =>
    set((state) => ({
      chartIndicators: {
        ...state.chartIndicators,
        smaLines: state.chartIndicators.smaLines.filter((l) => l.id !== id),
      },
    })),
  setEmaLine: (id, updates) =>
    set((state) => ({
      chartIndicators: {
        ...state.chartIndicators,
        emaLines: state.chartIndicators.emaLines.map((l) =>
          l.id === id ? { ...l, ...updates } : l
        ),
      },
    })),
  addEmaLine: () =>
    set((state) => {
      _emaCounter++;
      return {
        chartIndicators: {
          ...state.chartIndicators,
          emaLines: [...state.chartIndicators.emaLines, { id: `ema-${_emaCounter}`, period: 12, color: '#2196F3', enabled: true }],
        },
      };
    }),
  removeEmaLine: (id) =>
    set((state) => ({
      chartIndicators: {
        ...state.chartIndicators,
        emaLines: state.chartIndicators.emaLines.filter((l) => l.id !== id),
      },
    })),
  setRsiEnabled: (enabled) =>
    set((state) => ({
      chartIndicators: { ...state.chartIndicators, rsiEnabled: enabled },
    })),
  setRsiPeriod: (period) =>
    set((state) => ({
      chartIndicators: { ...state.chartIndicators, rsiPeriod: period },
    })),
  setIndicatorColor: (key, hex) =>
    set((state) => ({
      chartIndicators: {
        ...state.chartIndicators,
        colors: { ...state.chartIndicators.colors, [key]: hex },
      },
    })),
  setCoinsList: (list) => set({ coinsList: list }),
  setLastPrice: (symbol, price) =>
    set((state) => ({
      lastPrices: { ...state.lastPrices, [symbol]: price },
    })),
}));

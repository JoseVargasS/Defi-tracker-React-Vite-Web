import { create } from 'zustand';
import { DEFAULT_TRACKED_PAIRS } from '@/lib/config';
import { DEFAULT_INDICATOR_COLORS } from '@/lib/chart/indicators';
import type { LiveQuote } from '@/api/live';
import type { DrawTool, IndicatorColorKey, MaLineConfig, SmcToggles } from '@/lib/chart/types';

export type PairSortMode = 'MANUAL' | 'VOL_DESC' | 'VOL_ASC' | 'CHG_DESC' | 'CHG_ASC';

export const PAIR_SORT_CYCLE: readonly PairSortMode[] = [
  'MANUAL',
  'VOL_DESC',
  'VOL_ASC',
  'CHG_DESC',
  'CHG_ASC',
] as const;

export function nextPairSort(mode: PairSortMode): PairSortMode {
  const idx = PAIR_SORT_CYCLE.indexOf(mode);
  return PAIR_SORT_CYCLE[(idx + 1) % PAIR_SORT_CYCLE.length]!;
}

export { DEFAULT_INDICATOR_COLORS };

export interface ChartIndicatorsState {
  bollinger: boolean;
  volume: boolean;
  stochRsi: boolean;
  volumeProfile: boolean;
  macd: boolean;
  taker: boolean;
  divs: boolean;
  signals: boolean;
  smc: SmcToggles;
  smaLines: MaLineConfig[];
  emaLines: MaLineConfig[];
  rsiEnabled: boolean;
  rsiPeriod: number;
  colors: Record<IndicatorColorKey, string>;
  drawTool: DrawTool;
}

export type ChartMode = 'chartjs' | 'tradingview' | 'lightweight';

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
  { id: 'ema-12', period: 12, color: '#2196F3', enabled: false },
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
  liveQuotes: Record<string, LiveQuote>;
  pairSort: PairSortMode;
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
  setSmcToggle: (key: keyof SmcToggles, value: boolean) => void;
  setDrawTool: (tool: DrawTool) => void;
  setIndicatorColor: (key: IndicatorColorKey, hex: string) => void;
  setCoinsList: (list: unknown[]) => void;
  overlaysTick: number;
  bumpOverlays: () => void;
  setLastPrice: (symbol: string, price: number) => void;
  setLiveQuotes: (batch: Record<string, LiveQuote>) => void;
  setPairSort: (mode: PairSortMode) => void;
  cyclePairSort: () => void;
  moveTracked: (fromIndex: number, toIndex: number) => void;
}

export const useMarketStore = create<MarketState>((set) => ({
  activeView: 'market',
  chartMode: 'lightweight',
  tracked: [...DEFAULT_TRACKED_PAIRS],
  currentPair: null,
  currentInterval: '5m',
  chartIndicators: {
    bollinger: false,
    volume: true,
    stochRsi: false,
    volumeProfile: false,
    macd: false,
    taker: false,
    divs: false,
    signals: true,
    smc: {
      swings: false,
      structure: false,
      zones: false,
      premium: false,
      eq: false,
      liquidity: false,
      confluence: false,
    },
    smaLines: DEFAULT_SMA_LINES.map(l => ({ ...l })),
    emaLines: DEFAULT_EMA_LINES.map(l => ({ ...l })),
    rsiEnabled: true,
    rsiPeriod: 14,
    colors: { ...DEFAULT_INDICATOR_COLORS },
    drawTool: null,
  },
  lastPrices: {},
  liveQuotes: {},
  pairSort: 'MANUAL',
  overlaysTick: 0,
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
          smaLines: [...state.chartIndicators.smaLines, { id: `sma-${_smaCounter}`, period: 50, color: '#00BCD4', enabled: true, kind: 'SMA', timeframe: 'chart', width: 1 }],
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
          emaLines: [...state.chartIndicators.emaLines, { id: `ema-${_emaCounter}`, period: 12, color: '#2196F3', enabled: true, kind: 'EMA', timeframe: 'chart', width: 1 }],
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
  setSmcToggle: (key, value) =>
    set((state) => ({
      chartIndicators: {
        ...state.chartIndicators,
        smc: { ...state.chartIndicators.smc, [key]: value },
      },
    })),
  setDrawTool: (tool) =>
    set((state) => ({
      chartIndicators: { ...state.chartIndicators, drawTool: tool },
    })),
  setIndicatorColor: (key, hex) =>
    set((state) => ({
      chartIndicators: {
        ...state.chartIndicators,
        colors: { ...state.chartIndicators.colors, [key]: hex },
      },
    })),
  setCoinsList: (list) => set({ coinsList: list }),
  bumpOverlays: () => set((state) => ({ overlaysTick: state.overlaysTick + 1 })),
  setLastPrice: (symbol, price) =>
    set((state) => ({
      lastPrices: { ...state.lastPrices, [symbol]: price },
    })),
  setLiveQuotes: (batch) =>
    set((state) => ({
      liveQuotes: { ...state.liveQuotes, ...batch },
    })),
  setPairSort: (mode) => set({ pairSort: mode }),
  cyclePairSort: () => set((state) => ({ pairSort: nextPairSort(state.pairSort) })),
  moveTracked: (fromIndex, toIndex) =>
    set((state) => {
      const next = [...state.tracked];
      if (fromIndex < 0 || fromIndex >= next.length || toIndex < 0 || toIndex >= next.length) {
        return state;
      }
      const [moved] = next.splice(fromIndex, 1);
      next.splice(toIndex, 0, moved!);
      return { tracked: next };
    }),
}));

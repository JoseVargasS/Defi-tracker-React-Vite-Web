import { create } from 'zustand';
import { DEFAULT_TRACKED_PAIRS } from '@/lib/config';
import { DEFAULT_INDICATOR_COLORS } from '@/lib/chart/indicators';
import type { IndicatorColorKey } from '@/lib/chart/types';

export { DEFAULT_INDICATOR_COLORS };

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
  colors: Record<IndicatorColorKey, string>;
}

export type ChartMode = 'chartjs' | 'tradingview';

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
  setSmaPeriod: (period: number) => void;
  setEmaPeriod: (period: number) => void;
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
    smaEnabled: false,
    smaPeriod: 200,
    emaEnabled: false,
    emaPeriod: 200,
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
  setSmaPeriod: (period) =>
    set((state) => ({
      chartIndicators: { ...state.chartIndicators, smaPeriod: period },
    })),
  setEmaPeriod: (period) =>
    set((state) => ({
      chartIndicators: { ...state.chartIndicators, emaPeriod: period },
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

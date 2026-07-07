import { create } from 'zustand';
import { DEFAULT_TRACKED_PAIRS } from '@/lib/config';

export interface ChartIndicatorsState {
  bollinger: boolean;
  volume: boolean;
  stochRsi: boolean;
  volumeProfile: boolean;
  smaEnabled: boolean;
  smaPeriod: number;
  emaEnabled: boolean;
  emaPeriod: number;
}

interface MarketState {
  activeView: 'market' | 'wallet';
  tracked: string[];
  currentPair: string | null;
  currentInterval: string;
  chartIndicators: ChartIndicatorsState;
  lastPrices: Record<string, number>;
  coinsList: unknown[];

  setActiveView: (view: 'market' | 'wallet') => void;
  setTracked: (pairs: string[]) => void;
  addTracked: (pair: string) => void;
  removeTracked: (pair: string) => void;
  setCurrentPair: (pair: string | null) => void;
  setCurrentInterval: (interval: string) => void;
  setChartIndicator: (key: keyof ChartIndicatorsState, value: boolean) => void;
  setSmaPeriod: (period: number) => void;
  setEmaPeriod: (period: number) => void;
  setCoinsList: (list: unknown[]) => void;
  setLastPrice: (symbol: string, price: number) => void;
}

export const useMarketStore = create<MarketState>((set) => ({
  activeView: 'market',
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
  },
  lastPrices: {},
  coinsList: [],

  setActiveView: (view) => set({ activeView: view }),
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
  setCoinsList: (list) => set({ coinsList: list }),
  setLastPrice: (symbol, price) =>
    set((state) => ({
      lastPrices: { ...state.lastPrices, [symbol]: price },
    })),
}));

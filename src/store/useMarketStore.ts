import { create } from 'zustand';
import { DEFAULT_TRACKED_PAIRS } from '@/lib/config';

interface ChartIndicators {
  bollinger: boolean;
  volume: boolean;
  stochRsi: boolean;
  volumeProfile: boolean;
  smaEnabled: boolean;
  smaPeriod: number;
  emaEnabled: boolean;
  emaPeriod: number;
}

interface ChartMeasure {
  active: boolean;
  start: number | null;
  end: number | null;
  preview: number | null;
}

interface MarketState {
  activeView: 'market' | 'wallet';
  tracked: string[];
  currentPair: string | null;
  currentInterval: string;
  chartZoom: number;
  chartIndicators: ChartIndicators;
  chartMeasure: ChartMeasure;
  lastPrices: Record<string, number>;
  coinIcons: Record<string, string>;
  pricesCache: Record<string, unknown>;
  historicalChartCache: Record<string, unknown>;
  coinLookupCache: Record<string, unknown>;
  coinsList: unknown[];
  currentPairPrice: number | null;
  candleRenderLock: boolean;

  setActiveView: (view: 'market' | 'wallet') => void;
  setTracked: (pairs: string[]) => void;
  addTracked: (pair: string) => void;
  removeTracked: (pair: string) => void;
  setCurrentPair: (pair: string | null) => void;
  setCurrentInterval: (interval: string) => void;
  setChartZoom: (zoom: number) => void;
  setChartIndicator: (key: keyof ChartIndicators, value: boolean) => void;
  setSmaPeriod: (period: number) => void;
  setEmaPeriod: (period: number) => void;
  setCoinIcons: (icons: Record<string, string>) => void;
  setCoinsList: (list: unknown[]) => void;
  setCurrentPairPrice: (price: number | null) => void;
  setLastPrice: (symbol: string, price: number) => void;
  setCandleRenderLock: (lock: boolean) => void;
  setChartMeasureActive: (active: boolean) => void;
}

export const useMarketStore = create<MarketState>((set) => ({
  activeView: 'market',
  tracked: [...DEFAULT_TRACKED_PAIRS],
  currentPair: null,
  currentInterval: '1d',
  chartZoom: 120,
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
  chartMeasure: {
    active: false,
    start: null,
    end: null,
    preview: null,
  },
  lastPrices: {},
  coinIcons: {},
  pricesCache: {},
  historicalChartCache: {},
  coinLookupCache: {},
  coinsList: [],
  currentPairPrice: null,
  candleRenderLock: false,

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
  setChartZoom: (zoom) => set({ chartZoom: zoom }),
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
  setCoinIcons: (icons) => set({ coinIcons: icons }),
  setCoinsList: (list) => set({ coinsList: list }),
  setCurrentPairPrice: (price) => set({ currentPairPrice: price }),
  setLastPrice: (symbol, price) =>
    set((state) => ({
      lastPrices: { ...state.lastPrices, [symbol]: price },
    })),
  setCandleRenderLock: (lock) => set({ candleRenderLock: lock }),
  setChartMeasureActive: (active) =>
    set((state) => ({
      chartMeasure: { ...state.chartMeasure, active },
    })),
}));

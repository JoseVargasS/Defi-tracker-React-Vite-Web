// js/state.js
export const DEFAULT_TRACKED_PAIRS = [
  'ETHUSDT',
  'BTCUSDT',
  'USUALUSDT',
  'VELODROMEUSDT',
  'BATUSDT',
  'BIOUSDT'
];

export const APP_STORAGE_VERSION = '2026-05-20-1';

export const state = {
  tracked: [...DEFAULT_TRACKED_PAIRS],
  chartInstance: null,
  currentPair: null,
  currentInterval: '1d',
  chartZoom: 120,
  chartView: {
    minVisible: 24,
    zoomStep: 16,
    panSensitivity: 6
  },
  chartIndicators: {
    bollinger: true,
    volume: true,
    stochRsi: true,
    volumeProfile: true
  },
  volumeProfile: {
    rows: 72,
    widthRatio: 0.38,
    minWidth: 130,
    maxWidth: 320
  },
  chartMeasure: {
    active: false,
    start: null,
    end: null,
    preview: null
  },
  lastPrices: {},
  coinIcons: {},
  pricesCache: {},
  historicalChartCache: {},
  coinLookupCache: {},
  candleRenderLock: false,
  detailInterval: null,
  coinsList: [],
  loadingRequests: {},
  currentPairPrice: null
};


export const names = { BTC: 'BTC', ETH: 'ETH', USDT: 'Tether', BNB: 'BNB', SOL: 'Solana', ADA: 'Cardano', XRP: 'XRP', DOGE: 'Dogecoin', MATIC: 'Polygon', TRX: 'TRON', LINK: 'Chainlink', LTC: 'Litecoin', DOT: 'Polkadot', SHIB: 'Shiba Inu', USDC: 'USD Coin', AVAX: 'Avalanche', OP: 'Optimism', ARB: 'Arbitrum', PEPE: 'Pepe' };

export const monthNames = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

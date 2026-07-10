// === API endpoints (env-overridable) ===
export const BINANCE_API =
  import.meta.env.VITE_BINANCE_API || 'https://api.binance.com/api/v3';
export const COINSTATS_API =
  import.meta.env.VITE_COINSTATS_API || 'https://openapiv1.coinstats.app';
export const COINSTATS_API_KEY = import.meta.env.VITE_COINSTATS_API_KEY || '';
export const ETH_API =
  import.meta.env.VITE_ETH_API || 'https://api.etherscan.io/v2/api';
export const ETH_KEY = import.meta.env.VITE_ETH_KEY || '';

export const HAS_COINSTATS_CONFIG = Boolean(
  COINSTATS_API_KEY && COINSTATS_API_KEY !== 'replace-me'
);
export const HAS_ETHERSCAN_CONFIG = Boolean(ETH_KEY && ETH_KEY !== 'replace-me');

// === App identity ===
export const APP_NAME = 'DeFi & Crypto Terminal';
export const APP_STORAGE_VERSION = '2026-07-10-1';

// === Chart intervals ===
// `key` is what the UI/store/cache use; `binance` is what Binance's API expects.
export interface ChartInterval {
  readonly key: string;
  readonly label: string;
  readonly binance: string;
  readonly barCount: number;
  readonly aggregate?: number;
}

export const CHART_INTERVALS: readonly ChartInterval[] = [
  { key: '1m',  label: '1m',  binance: '1m',  barCount: 500 },
  { key: '3m',  label: '3m',  binance: '3m',  barCount: 500 },
  { key: '5m',  label: '5m',  binance: '5m',  barCount: 500 },
  { key: '15m', label: '15m', binance: '15m', barCount: 500 },
  { key: '30m', label: '30m', binance: '30m', barCount: 500 },
  { key: '1h',  label: '1H',  binance: '1h',  barCount: 500 },
  { key: '2h',  label: '2H',  binance: '2h',  barCount: 500 },
  { key: '4h',  label: '4H',  binance: '4h',  barCount: 500 },
  { key: '6h',  label: '6H',  binance: '6h',  barCount: 500 },
  { key: '8h',  label: '8H',  binance: '8h',  barCount: 500 },
  { key: '12h', label: '12H', binance: '12h', barCount: 500 },
  { key: '1d',  label: '1D',  binance: '1d',  barCount: 1000 },
  { key: '3d',  label: '3D',  binance: '3d',  barCount: 500 },
  { key: '5d',  label: '5D',  binance: '1d',  barCount: 500, aggregate: 5 },
  { key: '1w',  label: '1w',  binance: '1w',  barCount: 500 },
  { key: '1M',  label: '1M',  binance: '1M',  barCount: 500 },
  { key: '3M',  label: '3M',  binance: '1M',  barCount: 500, aggregate: 3 },
] as const;

export const BINANCE_NATIVE_INTERVALS = [
  '1m','3m','5m','15m','30m','1h','2h','4h','6h','8h','12h','1d','3d','1w','1M',
] as const;
export type BinanceNativeInterval = typeof BINANCE_NATIVE_INTERVALS[number];

export function isValidBinanceInterval(interval: string): boolean {
  return (BINANCE_NATIVE_INTERVALS as readonly string[]).includes(interval);
}

export const CHART_INTERVAL_KEYS = CHART_INTERVALS.map((i) => i.key);
const BINANCE_INTERVAL_MAP: Record<string, string> = CHART_INTERVALS.reduce(
  (acc, iv) => {
    acc[iv.key] = iv.binance;
    return acc;
  },
  {} as Record<string, string>
);
const BAR_COUNT_BY_INTERVAL: Record<string, number> = CHART_INTERVALS.reduce(
  (acc, iv) => {
    acc[iv.key] = iv.barCount;
    return acc;
  },
  {} as Record<string, number>
);
const AGGREGATE_BY_INTERVAL: Record<string, number> = CHART_INTERVALS.reduce(
  (acc, iv) => {
    if (iv.aggregate) acc[iv.key] = iv.aggregate;
    return acc;
  },
  {} as Record<string, number>
);

export const DEFAULT_CHART_BAR_COUNT = 1000;
export const MAX_CHART_BAR_COUNT = 5000;
export const CHART_PAGINATION_STEP = 1000;
export const CHART_EDGE_THRESHOLD_RATIO = 0.12;

export function binanceInterval(interval: string): string {
  return BINANCE_INTERVAL_MAP[interval] || '1d';
}
export function intervalBarCount(interval: string): number {
  return BAR_COUNT_BY_INTERVAL[interval] ?? DEFAULT_CHART_BAR_COUNT;
}
export function intervalAggregate(interval: string): number | null {
  return AGGREGATE_BY_INTERVAL[interval] ?? null;
}

// === Pair symbol parsing ===
export const KNOWN_QUOTES = [
  'USDT', 'USDC', 'FDUSD', 'BTC', 'ETH', 'BNB', 'TRY', 'EUR', 'BRL', 'DAI',
] as const;

export function splitPairSymbol(symbol: string): { base: string; quote: string } {
  const upper = String(symbol || '').toUpperCase();
  const quote = KNOWN_QUOTES.find((q) => upper.endsWith(q)) ?? '';
  return quote
    ? { base: upper.slice(0, -quote.length), quote }
    : { base: upper, quote: '' };
}

// === Wallet & tx ===
export const WALLET_ADDRESS_RE = /^0x[a-fA-F0-9]{40}$/;
export const PAIR_SYMBOL_RE = /^[A-Z0-9]{3,30}$/;
export const WALLET_BALANCE_CONCURRENCY = 1;

export const STABLE_PRICES: Record<string, number> = {
  USDT: 1, USDC: 1, USD0: 1, DAI: 1,
};

export interface ChainFallback {
  chainId: number;
  nativeSymbol: string;
  nativeName: string;
}

export const CHAIN_FALLBACKS: Record<string, ChainFallback> = {
  ethereum:        { chainId: 1,   nativeSymbol: 'ETH', nativeName: 'Ethereum' },
  'base-wallet':   { chainId: 8453, nativeSymbol: 'ETH', nativeName: 'Ethereum' },
  binancesmartchain:{ chainId: 56,  nativeSymbol: 'BNB', nativeName: 'BNB' },
};

// === Polling ===
export const TRACKED_PAIRS_POLL_MS = 5000;

// === Supported chains (UI labels) ===
export const SUPPORTED_CHAINS = [
  { id: 'ethereum',         name: 'Ether', icon: 'https://cryptologos.cc/logos/ethereum-eth-logo.png' },
  { id: 'base-wallet',      name: 'Base',  icon: 'https://cryptologos.cc/logos/ethereum-eth-logo.png' },
  { id: 'binancesmartchain',name: 'BSC',   icon: 'https://cryptologos.cc/logos/bnb-bnb-logo.png' },
] as const;

// === Default tracked pairs ===
export const DEFAULT_TRACKED_PAIRS = [
  'ETHUSDT',
  'BTCUSDT',
  'USUALUSDT',
  'VELODROMEUSDT',
  'BATUSDT',
  'BIOUSDT',
];

// === Theme tokens (mirrors CSS :root for the canvas) ===
export const COLORS = {
  bg: '#100e0c',
  surface1: '#100e0c',
  surface2: '#1a1815',
  surface3: '#25221d',
  border: '#2a2724',
  ink1: '#f0eeeb',
  ink2: '#b8b4ad',
  ink3: '#7c7770',
  ink4: '#4a4641',
  positive: '#00c087',
  positiveSoft: 'rgba(0, 192, 135, 0.16)',
  negative: '#f23645',
  negativeSoft: 'rgba(242, 54, 69, 0.16)',
  accent: '#f2c94c',
  up: '#00c087',
  down: '#f23645',
  neutral: '#858b93',
  bbLine: 'rgba(242, 201, 76, 0.78)',
  bbFill: 'rgba(242, 201, 76, 0.055)',
  bbBasis: 'rgba(235, 87, 87, 0.7)',
  grid: 'rgba(255, 255, 255, 0.055)',
  volGrid: 'rgba(255, 255, 255, 0.035)',
  stochGrid: 'rgba(255, 255, 255, 0.04)',
  stochK: '#2f80ed',
  stochD: '#f2994a',
  stochLevelOver: 'rgba(242, 54, 69, 0.35)',
  stochLevelUnder: 'rgba(0, 192, 135, 0.35)',
  sma: '#f5eef2',
  ema: '#06b6d4',
  plPositive: '#1ecb81',
  plNegative: '#e74c3c',
  plNeutral: '#aaa',
} as const;

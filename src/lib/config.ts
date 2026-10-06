// === API endpoints (env-overridable) ===
export const BINANCE_API =
  import.meta.env.VITE_BINANCE_API || 'https://api.binance.com/api/v3';
export const BINANCE_FUTURES_API =
  import.meta.env.VITE_BINANCE_FUTURES_API || 'https://fapi.binance.com';
// contract.mexc.com no manda CORS: en dev se proxyfea con Vite (/api/mexc)
// y en prod con el worker de Cloudflare (VITE_MEXC_FUTURES_API o VITE_AI_PROXY_URL + /mexc).
const AI_PROXY_BASE = (import.meta.env.VITE_AI_PROXY_URL || '').replace(/\/$/, '');
export const MEXC_FUTURES_API =
  import.meta.env.VITE_MEXC_FUTURES_API ||
  (AI_PROXY_BASE ? `${AI_PROXY_BASE}/mexc` : null) ||
  (import.meta.env.DEV ? '/api/mexc' : 'https://contract.mexc.com/api/v1');
export const COINSTATS_API =
  import.meta.env.VITE_COINSTATS_API || 'https://openapiv1.coinstats.app';
export const COINSTATS_API_KEY = import.meta.env.VITE_COINSTATS_API_KEY || '';
export const ETH_API =
  import.meta.env.VITE_ETH_API || 'https://api.etherscan.io/v2/api';
export const ETH_KEY = import.meta.env.VITE_ETH_KEY || '';

export const OPENCODE_GO_KEY = import.meta.env.VITE_OPENCODE_GO_KEY || '';
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
  { key: '2w',  label: '2w',  binance: '1w',  barCount: 500, aggregate: 2 },
  { key: '1M',  label: '1M',  binance: '1M',  barCount: 500 },
  { key: '1mo', label: '1mo', binance: '1M',  barCount: 500 },
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
  solana:          { chainId: 101, nativeSymbol: 'SOL', nativeName: 'Solana' },
  optimism:        { chainId: 10,  nativeSymbol: 'ETH', nativeName: 'Ethereum' },
  arbitrum:        { chainId: 42161, nativeSymbol: 'ETH', nativeName: 'Ethereum' },
  polygon:         { chainId: 137, nativeSymbol: 'MATIC', nativeName: 'Matic' },
};

// === Polling ===
export const TRACKED_PAIRS_POLL_MS = 5000;

// === Supported chains (UI labels) ===
export const SUPPORTED_CHAINS = [
  { id: 'ethereum',         name: 'Ether',    icon: 'https://cryptologos.cc/logos/ethereum-eth-logo.png' },
  { id: 'base-wallet',      name: 'Base',     icon: 'https://cryptologos.cc/logos/ethereum-eth-logo.png' },
  { id: 'binancesmartchain',name: 'BSC',      icon: 'https://cryptologos.cc/logos/bnb-bnb-logo.png' },
  { id: 'solana',           name: 'Solana',   icon: 'https://cryptologos.cc/logos/solana-sol-logo.png' },
  { id: 'optimism',         name: 'Optimism', icon: 'https://cryptologos.cc/logos/ethereum-eth-logo.png' },
  { id: 'arbitrum',         name: 'Arbitrum', icon: 'https://cryptologos.cc/logos/ethereum-eth-logo.png' },
  { id: 'polygon',          name: 'Polygon',  icon: 'https://cryptologos.cc/logos/polygon-matic-logo.png' },
] as const;

export type CoinStatsChainId = (typeof SUPPORTED_CHAINS)[number]['id'];

// Chains tal cual la app Android: balances en este orden, secuencial con delay.
export const WALLET_BALANCE_CHAINS: readonly { id: string; name: string }[] = [
  { id: 'ethereum', name: 'Ether' },
  { id: 'base-wallet', name: 'Base' },
  { id: 'binancesmartchain', name: 'BSC' },
  { id: 'solana', name: 'Solana' },
  { id: 'optimism', name: 'Optimism' },
  { id: 'arbitrum', name: 'Arbitrum' },
  { id: 'polygon', name: 'Polygon' },
] as const;

export const TRANSACTION_CHAINS: readonly { id: string; name: string }[] = [
  { id: 'ethereum', name: 'Ethereum' },
  { id: 'base-wallet', name: 'Base' },
  { id: 'binancesmartchain', name: 'BSC' },
  { id: 'polygon', name: 'Polygon' },
  { id: 'arbitrum', name: 'Arbitrum' },
  { id: 'optimism', name: 'Optimism' },
  { id: 'solana', name: 'Solana' },
] as const;

export const WALLET_CHAIN_DELAY_MS = 500;
export const TRANSACTION_CHAIN_DELAY_MS = 450;
export const BALANCE_DUST_THRESHOLD = 0.0001;
export const TRANSACTION_QUERY_DAYS = 365;
export const TRANSACTION_SYNC_TTL_MS = 60_000;

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
  bg: '#000000',
  surface1: '#000000',
  surface2: '#0e0e0e',
  surface3: '#171717',
  border: '#262626',
  ink1: '#f0eeeb',
  ink2: '#b8b4ad',
  ink3: '#7c7770',
  ink4: '#4a4a4a',
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

// === Multi-source market (port Android: Binance spot + MEXC futuros + TV) ===
export type PairSource = 'Binance' | 'MEXC' | 'TV';

export const PAIR_SOURCES: readonly PairSource[] = ['Binance', 'MEXC', 'TV'] as const;

export function isPairSource(value: unknown): value is PairSource {
  return value === 'Binance' || value === 'MEXC' || value === 'TV';
}

// Key estable "$symbol-$source" igual que pairKey del ViewModel Android.
export function pairKey(symbol: string, source: PairSource): string {
  return `${String(symbol || '').toUpperCase()}-${source}`;
}

// Parsea entradas del watchlist. Legacy "BTCUSDT" -> Binance; "BTC_USDT-MEXC" o
// "BTC.D-TV" llevan sufijo de fuente. Mantiene compat con lo ya guardado.
export function parseTrackedPair(entry: string): { symbol: string; source: PairSource } {
  const upper = String(entry || '').toUpperCase();
  const dash = upper.lastIndexOf('-');
  if (dash > 0) {
    const maybeSource = upper.slice(dash + 1);
    if (isPairSource(maybeSource)) {
      return { symbol: upper.slice(0, dash), source: maybeSource };
    }
  }
  return { symbol: upper, source: 'Binance' };
}

export function formatTrackedPair(symbol: string, source: PairSource): string {
  return source === 'Binance' ? String(symbol || '').toUpperCase() : pairKey(symbol, source);
}

export function sourceLabel(source: PairSource): string {
  return source === 'Binance' ? 'Binance · Spot'
    : source === 'MEXC' ? 'MEXC · Futuros'
    : 'TradingView · CRYPTOCAP';
}

// Plan base MEXC + factor de agregacion en repo (port de mexcKlinePlan).
export const MEXC_KLINE_PLAN: Record<string, { mexcInterval: string; factor: number }> = {
  '1m': { mexcInterval: 'Min1', factor: 1 },
  '3m': { mexcInterval: 'Min1', factor: 3 },
  '5m': { mexcInterval: 'Min5', factor: 1 },
  '15m': { mexcInterval: 'Min15', factor: 1 },
  '30m': { mexcInterval: 'Min30', factor: 1 },
  '1h': { mexcInterval: 'Min60', factor: 1 },
  '2h': { mexcInterval: 'Min60', factor: 2 },
  '4h': { mexcInterval: 'Hour4', factor: 1 },
  '6h': { mexcInterval: 'Min60', factor: 6 },
  '8h': { mexcInterval: 'Min60', factor: 8 },
  '12h': { mexcInterval: 'Hour4', factor: 3 },
  '1d': { mexcInterval: 'Day1', factor: 1 },
  '3d': { mexcInterval: 'Day1', factor: 3 },
  '5d': { mexcInterval: 'Day1', factor: 5 },
  '1w': { mexcInterval: 'Week1', factor: 1 },
  '2w': { mexcInterval: 'Week1', factor: 2 },
  '1M': { mexcInterval: 'Month1', factor: 1 },
  '1mo': { mexcInterval: 'Month1', factor: 1 },
  '3M': { mexcInterval: 'Month1', factor: 3 },
};

export function mexcKlinePlan(interval: string): { mexcInterval: string; factor: number } {
  return MEXC_KLINE_PLAN[interval] ?? { mexcInterval: 'Min60', factor: 1 };
}

export const MEXC_BASE_DURATION_MS: Record<string, number> = {
  Min1: 60_000,
  Min5: 300_000,
  Min15: 900_000,
  Min30: 1_800_000,
  Min60: 3_600_000,
  Hour4: 14_400_000,
  Day1: 86_400_000,
  Week1: 604_800_000,
};

// Lunes 2020-01-06T00:00Z, ancla de buckets semanales (la epoca cae jueves).
export const WEEK_ANCHOR_MS = 1_578_182_400_000;

// TFs con periodo taker nativo en Binance Futuros (port de TAKER_NATIVE_INTERVALS).
export const TAKER_NATIVE_INTERVALS: readonly string[] = [
  '5m', '15m', '30m', '1h', '2h', '4h', '6h', '12h', '1d',
] as const;

export function hasNativeTakerInterval(interval: string): boolean {
  return (TAKER_NATIVE_INTERVALS as readonly string[]).includes(interval.trim());
}

// Paginas de klines por intervalo (port de chartPageCountForInterval).
export function chartPageCountForInterval(interval: string): number {
  if (interval === '1m' || interval === '5m' || interval === '15m') return 3;
  if (interval === '30m' || interval === '1h') return 2;
  return 1;
}

export const TV_TICKER_PREFIX = 'CRYPTOCAP:';

export function tvTicker(symbol: string): string {
  const upper = String(symbol || '').toUpperCase();
  return upper.startsWith(TV_TICKER_PREFIX) ? upper : `${TV_TICKER_PREFIX}${upper}`;
}

export function tvResolution(interval: string): string {
  switch (interval.trim()) {
    case '1m': return '1';
    case '3m': return '3';
    case '5m': return '5';
    case '15m': return '15';
    case '30m': return '30';
    case '1h': return '60';
    case '2h': return '120';
    case '4h': return '240';
    case '6h': return '360';
    case '8h': return '480';
    case '12h': return '720';
    case '1d':
    case '5d': return '1D';
    case '3d': return '3D';
    case '1w':
    case '2w': return '1W';
    case '1M':
    case '1mo':
    case '3M': return '1M';
    default: return '60';
  }
}

export interface TvIndexSymbol {
  symbol: string;
  base: string;
  quote: string;
  keywords: string;
}

// Descriptor corto por indice TV (dominancia / cap), como muestra la app.
export const TV_INDEX_HINTS: Record<string, string> = {
  'BTC.D': 'Dominancia BTC',
  'ETH.D': 'Dominancia ETH',
  'USDT.D': 'Dominancia USDT',
  'USDC.D': 'Dominancia USDC',
  'OTHERS.D': 'Dominancia Others',
  'BTC': 'Cap. mercado BTC',
  'ETH': 'Cap. mercado ETH',
  'USDT': 'Cap. mercado USDT',
  'USDC': 'Cap. mercado USDC',
  'TOTAL': 'Cap. total mercado',
  'TOTAL2': 'Cap. total ex-BTC',
  'TOTAL3': 'Cap. total ex-BTC/ETH',
  'OTHERS': 'Cap. altcoins',
};

export function tvIndexHint(symbol: string): string {
  return TV_INDEX_HINTS[String(symbol || '').toUpperCase()] ?? 'TradingView · CRYPTOCAP';
}

// Indices que TradingView publica como CRYPTOCAP:* (port de tvIndexSymbols).
export const TV_INDEX_SYMBOLS: readonly TvIndexSymbol[] = [
  { symbol: 'BTC.D', base: 'BTC.D', quote: '', keywords: 'btc dominance dominancia' },
  { symbol: 'ETH.D', base: 'ETH.D', quote: '', keywords: 'eth dominance dominancia' },
  { symbol: 'USDT.D', base: 'USDT.D', quote: '', keywords: 'usdt dominance dominancia tether' },
  { symbol: 'USDC.D', base: 'USDC.D', quote: '', keywords: 'usdc dominance dominancia' },
  { symbol: 'OTHERS.D', base: 'OTHERS.D', quote: '', keywords: 'others dominance dominancia other' },
  { symbol: 'BTC', base: 'BTC', quote: '', keywords: 'btc bitcoin market cap' },
  { symbol: 'ETH', base: 'ETH', quote: '', keywords: 'eth ethereum market cap' },
  { symbol: 'USDT', base: 'USDT', quote: '', keywords: 'usdt tether stablecoin' },
  { symbol: 'USDC', base: 'USDC', quote: '', keywords: 'usdc stablecoin' },
  { symbol: 'TOTAL', base: 'TOTAL', quote: '', keywords: 'total market cap' },
  { symbol: 'TOTAL2', base: 'TOTAL2', quote: '', keywords: 'total2 market cap' },
  { symbol: 'TOTAL3', base: 'TOTAL3', quote: '', keywords: 'total3 market cap' },
  { symbol: 'OTHERS', base: 'OTHERS', quote: '', keywords: 'others altcoins market cap' },
] as const;

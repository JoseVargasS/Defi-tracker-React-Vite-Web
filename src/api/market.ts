import { fetch24hStats, fetchKlines, fetchLatestKlines, fetchPrice, getRecentCloses } from '@/api/binance';
import { aggregateMexcRows, fetchMexcContracts, fetchMexcKlines, fetchMexcTicker } from '@/api/mexc';
import { toCandleList } from '@/lib/chart/rsi';
import {
  TV_INDEX_SYMBOLS,
  formatTrackedPair,
  mexcKlinePlan,
  parseTrackedPair,
  type PairSource,
} from '@/lib/config';

export interface AvailableSymbol {
  symbol: string;
  base: string;
  quote: string;
  source: PairSource;
  keywords: string;
  displayName: string;
}

export interface PairDetail {
  symbol: string;
  price: number;
  priceChange: number;
  priceChangePercent: number;
  highPrice: number;
  lowPrice: number;
  volume: number;
  quoteVolume: number;
  isPositive: boolean;
  source: PairSource;
}

export function displayBase(entry: string): string {
  const { symbol, source } = parseTrackedPair(entry);
  if (source === 'MEXC') return symbol.split('_')[0] || symbol;
  if (source === 'TV') return symbol;
  const m = symbol.match(/^(.*?)(USDT|USDC|FDUSD|BTC|ETH|BNB|TRY|EUR|BRL|DAI)$/);
  return m ? m[1]! : symbol;
}

export function displayPairLabel(entry: string): string {
  const { symbol, source } = parseTrackedPair(entry);
  if (source === 'MEXC') return symbol.replace(/_/g, '').toUpperCase();
  if (source === 'TV') return symbol;
  const quote = displayQuote(entry);
  return quote ? `${displayBase(entry)}/${quote}` : symbol;
}

export function displayQuote(entry: string): string {
  const { symbol, source } = parseTrackedPair(entry);
  if (source === 'MEXC') return symbol.split('_')[1] || '';
  if (source === 'TV') return '';
  const m = symbol.match(/^(.*?)(USDT|USDC|FDUSD|BTC|ETH|BNB|TRY|EUR|BRL|DAI)$/);
  return m ? m[2]! : '';
}

let _symbolsCache: { ts: number; data: AvailableSymbol[] } | null = null;
const SYMBOLS_CACHE_TTL = 5 * 60 * 1000;

// Buscador unificado: Binance spot + MEXC futuros + 13 indices TV.
export async function fetchAvailableSymbols(): Promise<AvailableSymbol[]> {
  if (_symbolsCache && Date.now() - _symbolsCache.ts < SYMBOLS_CACHE_TTL) {
    return _symbolsCache.data;
  }
  const [binance, mexc] = await Promise.all([
    import('@/api/binance').then((m) => m.fetchCoinsList().catch(() => [])),
    fetchMexcContracts(),
  ]);
  const data: AvailableSymbol[] = [
    ...binance.map((c) => ({
      symbol: c.symbol,
      base: c.base,
      quote: c.quote,
      source: 'Binance' as PairSource,
      keywords: '',
      displayName: `${c.base}/${c.quote}`,
    })),
    ...mexc.map((c) => ({
      symbol: c.symbol,
      base: c.base,
      quote: c.quote,
      source: 'MEXC' as PairSource,
      keywords: `${c.base} futures perpetual`,
      displayName: `${c.base}/${c.quote}`,
    })),
    ...TV_INDEX_SYMBOLS.map((t) => ({
      symbol: t.symbol,
      base: t.base,
      quote: t.quote,
      source: 'TV' as PairSource,
      keywords: t.keywords,
      displayName: t.base,
    })),
  ];
  _symbolsCache = { ts: Date.now(), data };
  return data;
}

export function filterAvailableSymbols(
  list: AvailableSymbol[],
  query: string,
  limit = 10,
): AvailableSymbol[] {
  return filterAvailableSymbolsGrouped(list, query, limit).flatMap((g) => g.items);
}

export interface SymbolGroup {
  source: PairSource;
  title: string;
  items: AvailableSymbol[];
}

const GROUP_ORDER: { source: PairSource; title: string }[] = [
  { source: 'MEXC', title: 'Futuros perpetuos' },
  { source: 'Binance', title: 'Spot' },
  { source: 'TV', title: 'Índices' },
];

// Resultado agrupado por fuente: futuros primero, spot despues, indices al final.
export function filterAvailableSymbolsGrouped(
  list: AvailableSymbol[],
  query: string,
  perGroup = 7,
): SymbolGroup[] {
  const upper = query.trim().toUpperCase();
  if (!upper) return [];
  const normalized = upper.replace(/[^A-Z0-9]/g, '');
  const matches = (c: AvailableSymbol): boolean => {
    const hay = `${c.symbol} ${c.base} ${c.quote} ${c.displayName} ${c.keywords}`.toUpperCase();
    return hay.includes(upper) || (normalized !== '' && c.symbol.replace(/[^A-Z0-9]/g, '').includes(normalized));
  };
  return GROUP_ORDER.map(({ source, title }) => ({
    source,
    title,
    items: list.filter((c) => c.source === source && matches(c)).slice(0, perGroup),
  })).filter((g) => g.items.length > 0);
}

export async function fetchPairDetail(entry: string): Promise<PairDetail | null> {
  const { symbol, source } = parseTrackedPair(entry);
  try {
    if (source === 'MEXC') {
      const t = await fetchMexcTicker(symbol);
      if (!t) return null;
      return { ...t, symbol, source, isPositive: t.priceChangePercent >= 0 };
    }
    if (source === 'TV') return null;
    const [stats, priceRes] = await Promise.all([fetch24hStats(symbol), fetchPrice(symbol)]);
    if (!stats && !priceRes) return null;
    const price = Number(priceRes?.price ?? 0) || 0;
    const pct = Number(stats?.priceChangePercent ?? 0) || 0;
    return {
      symbol,
      price,
      priceChange: Number(stats?.priceChange ?? 0) || 0,
      priceChangePercent: pct,
      highPrice: Number(stats?.highPrice ?? 0) || 0,
      lowPrice: Number(stats?.lowPrice ?? 0) || 0,
      volume: Number(stats?.volume ?? 0) || 0,
      quoteVolume: Number(stats?.quoteVolume ?? 0) || 0,
      isPositive: pct >= 0,
      source,
    };
  } catch {
    return null;
  }
}

// Dispatcher por fuente con la misma firma que fetchKlines (drop-in).
export async function fetchCandles(entry: string, interval: string, limit?: number): Promise<unknown[][]> {
  const { symbol, source } = parseTrackedPair(entry);
  if (source === 'MEXC') return fetchMexcKlines(symbol, interval);
  if (source === 'TV') return [];
  return (await fetchKlines(symbol, interval, limit)) as unknown[][];
}

// Cola fresca para el polling del chart. En MEXC agrega con el mismo plan
// para que las keys de bucket calcen con las del chart.
export async function fetchLatestCandles(entry: string, interval: string, limit = 2): Promise<unknown[][]> {
  const { symbol, source } = parseTrackedPair(entry);
  if (source === 'MEXC') {
    const rows = await fetchMexcKlines(symbol, interval, { singlePage: true });
    const { mexcInterval, factor } = mexcKlinePlan(interval);
    return aggregateMexcRows(rows, factor, mexcInterval).slice(-limit);
  }
  if (source === 'TV') return [];
  return fetchLatestKlines(symbol, interval, limit);
}

export function trackedEntryFor(symbol: string, source: PairSource): string {
  return formatTrackedPair(symbol, source);
}

// Par que toco sub-$1 en las ultimas 45 diarias: conserva los ceros de su banda.
export async function fetchExtendedFlag(entry: string): Promise<boolean> {
  const { symbol, source } = parseTrackedPair(entry);
  if (source === 'TV') return false;
  try {
    const closes = source === 'MEXC'
      ? toCandleList(await fetchMexcKlines(symbol, '1d')).slice(-45).map((c) => c.close)
      : await getRecentCloses(symbol, '1d', 45);
    return closes.some((c) => c < 1);
  } catch {
    return false;
  }
}

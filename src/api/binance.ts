import { makeRequest } from '@/api/client';
import { BINANCE_API, APP_STORAGE_VERSION } from '@/lib/config';
import { STORAGE_KEYS } from '@/lib/storage';

export const CACHE_DURATION = 60_000;

const COINS_CACHE_TTL = 24 * 60 * 60 * 1000;

export const _klinesCache = new Map<string, { data: unknown[]; ts: number }>();

function aggregateKlines(rawKlines: unknown[][], groupSize: number): string[][] {
  const aggregated: string[][] = [];
  for (let i = 0; i < rawKlines.length; i += groupSize) {
    const chunk = rawKlines.slice(i, i + groupSize);
    const openTime = chunk[0][0];
    const closeTime = chunk[chunk.length - 1][6];
    const open = parseFloat(chunk[0][1] as string);
    const close = parseFloat(chunk[chunk.length - 1][4] as string);
    let high = -Infinity;
    let low = Infinity;
    let volume = 0;
    let quoteVolume = 0;

    for (const candle of chunk) {
      const h = parseFloat(candle[2] as string);
      const l = parseFloat(candle[3] as string);
      if (h > high) high = h;
      if (l < low) low = l;
      volume += parseFloat((candle[5] ?? 0) as string);
      quoteVolume += parseFloat((candle[7] ?? 0) as string);
    }

    aggregated.push([
      String(openTime),
      open.toString(),
      high.toString(),
      low.toString(),
      close.toString(),
      volume.toString(),
      String(closeTime),
      quoteVolume.toString(),
    ]);
  }
  return aggregated;
}

/**
 * Fetch the latest price for a single symbol.
 */
export async function fetchPrice(symbol: string): Promise<{ symbol: string; price: string } | null> {
  try {
    const res = await makeRequest(`${BINANCE_API}/ticker/price?symbol=${symbol}`) as Record<string, string>;
    return { symbol: res.symbol, price: res.price };
  } catch (err) {
    console.warn('fetchPrice error', symbol, err);
    return null;
  }
}

/**
 * Fetch latest prices for multiple symbols in one request.
 * Uses Binance's `symbols` query parameter (URL-encoded JSON array).
 */
export async function fetchPriceBatch(symbols: string[]): Promise<{ symbol: string; price: string }[]> {
  if (!symbols || symbols.length === 0) return [];
  try {
    const param = encodeURIComponent(JSON.stringify(symbols));
    const res = await makeRequest(`${BINANCE_API}/ticker/price?symbols=${param}`) as { symbol: string; price: string }[];
    return Array.isArray(res) ? res : [];
  } catch (err) {
    console.warn('fetchPriceBatch error for', symbols, err);
    return [];
  }
}

/**
 * Shape of a Binance 24h ticker response (subset used by the app).
 */
export interface Binance24hStats {
  symbol: string;
  priceChange: string;
  priceChangePercent: string;
  highPrice: string;
  lowPrice: string;
  volume: string;
  quoteVolume: string;
}

/**
 * Fetch 24-hour ticker stats for a single symbol.
 */
export async function fetch24hStats(symbol: string): Promise<Binance24hStats | null> {
  try {
    const res = await makeRequest(`${BINANCE_API}/ticker/24hr?symbol=${symbol}`) as Binance24hStats;
    return res;
  } catch (err) {
    console.warn('fetch24hStats error', symbol, err);
    return null;
  }
}

/**
 * Fetch 24-hour ticker stats for multiple symbols in one request.
 * Uses Binance's `symbols` query parameter (URL-encoded JSON array).
 */
export async function fetch24hStatsBatch(symbols: string[]): Promise<Binance24hStats[]> {
  if (!symbols || symbols.length === 0) return [];
  try {
    const param = encodeURIComponent(JSON.stringify(symbols));
    const res = await makeRequest(`${BINANCE_API}/ticker/24hr?symbols=${param}`) as Binance24hStats[];
    return Array.isArray(res) ? res : [];
  } catch (err) {
    console.warn('fetch24hStatsBatch error for', symbols, err);
    return [];
  }
}

/**
 * Fetch klines/candlesticks for a symbol with an in-memory cache (60s TTL).
 * Returns array in format:
 * [openTime, open, high, low, close, volume, closeTime, quoteVolume, count, takerBuyVolume, takerBuyQuoteVolume, ignore]
 */
export async function fetchKlines(symbol: string, interval: string, limit?: number): Promise<unknown[]> {
  const intervalMap: Record<string, string> = {
    '3M': '1M', '1M': '1M', '1w': '1w', '5d': '1d',
    '3d': '3d', '1d': '1d', '12h': '12h', '4h': '4h',
    '1h': '1h', '15m': '15m', '5m': '5m', '1m': '1m',
  };
  const qInterval = intervalMap[interval] || '1d';
  const cacheKey = `${symbol}-${interval}`;
  const now = Date.now();

  const cached = _klinesCache.get(cacheKey);
  if (cached && now - cached.ts < CACHE_DURATION) return cached.data;

  try {
    const url = `${BINANCE_API}/klines?symbol=${symbol}&interval=${qInterval}&limit=${limit ?? 1000}`;
    const res = await makeRequest(url) as unknown[][];
    let klines = res;
    if (interval === '3M') klines = aggregateKlines(klines, 3);
    else if (interval === '5d') klines = aggregateKlines(klines, 5);

    _klinesCache.set(cacheKey, { data: klines, ts: now });
    return klines;
  } catch (err) {
    console.error('fetchKlines error', err);
    return [];
  }
}

/**
 * Fetch exchange info (trading pairs, filters, etc.).
 */
export async function fetchExchangeInfo(): Promise<{ symbols: unknown[] } | null> {
  try {
    const res = await makeRequest(`${BINANCE_API}/exchangeInfo`) as { symbols: unknown[] };
    return res;
  } catch (err) {
    console.warn('fetchExchangeInfo error', err);
    return null;
  }
}

export interface CoinInfo {
  symbol: string;
  base: string;
  quote: string;
}

/**
 * Fetch and cache the coins list from exchangeInfo with 24h localStorage TTL.
 * Respects APP_STORAGE_VERSION for cache invalidation.
 * Returns the list of coins (either from cache or fresh fetch).
 */
export async function fetchCoinsList(): Promise<CoinInfo[]> {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.coinsListCache);
    if (raw) {
      const parsed = JSON.parse(raw) as { ts: number; data: CoinInfo[]; version?: string };
      if (
        parsed.version === APP_STORAGE_VERSION &&
        Array.isArray(parsed.data) &&
        Date.now() - parsed.ts < COINS_CACHE_TTL
      ) {
        return parsed.data;
      }
    }
    const res = await makeRequest(`${BINANCE_API}/exchangeInfo`) as {
      symbols: {
        symbol: string;
        baseAsset: string;
        quoteAsset: string;
        status: string;
        isSpotTradingAllowed: boolean;
      }[];
    };
    const coinsList = (res.symbols || [])
      .filter((s) => s.status === 'TRADING' && s.isSpotTradingAllowed)
      .map((s) => ({ symbol: s.symbol, base: s.baseAsset, quote: s.quoteAsset }));
    
    localStorage.setItem(
      STORAGE_KEYS.coinsListCache,
      JSON.stringify({ ts: Date.now(), data: coinsList, version: APP_STORAGE_VERSION })
    );
    return coinsList;
  } catch (err) {
    console.error('Error fetching coins list:', err);
    try {
      const raw = localStorage.getItem(STORAGE_KEYS.coinsListCache);
      if (raw) {
        const parsed = JSON.parse(raw) as { data: CoinInfo[] };
        if (Array.isArray(parsed.data)) {
          return parsed.data;
        }
      }
    } catch { /* ignore fallback error */ }
    return [];
  }
}

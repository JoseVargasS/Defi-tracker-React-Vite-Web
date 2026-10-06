import { makeRequest } from '@/api/client';
import {
  MEXC_BASE_DURATION_MS,
  MEXC_FUTURES_API,
  WEEK_ANCHOR_MS,
  chartPageCountForInterval,
  mexcKlinePlan,
} from '@/lib/config';

export const MEXC_KLINE_PAGE_SIZE = 2000;

export interface MexcContract {
  symbol: string;
  base: string;
  quote: string;
}

interface MexcContractsResponse {
  success: boolean;
  code: number;
  data: {
    symbol: string;
    baseCoin: string;
    quoteCoin: string;
    settleCoin: string;
    futureType: number;
    state: number;
  }[];
}

interface MexcTickerResponse {
  success: boolean;
  code: number;
  data: {
    symbol: string;
    lastPrice: number;
    riseFallRate: number;
    riseFallValue: number;
    high24Price: number;
    lower24Price: number;
    volume24: number;
    amount24: number;
  };
}

interface MexcKlineResponse {
  success: boolean;
  code: number;
  data: {
    time: number[];
    open: number[];
    close: number[];
    high: number[];
    low: number[];
    vol: number[];
  };
}

export interface MexcPairDetail {
  symbol: string;
  price: number;
  priceChange: number;
  priceChangePercent: number;
  highPrice: number;
  lowPrice: number;
  volume: number;
  quoteVolume: number;
}

// Solo futuros USDT (la API mezcla spot/coin-m/futuros).
export async function fetchMexcContracts(): Promise<MexcContract[]> {
  try {
    const res = (await makeRequest(
      `${MEXC_FUTURES_API}/contract/detail`,
    )) as MexcContractsResponse;
    return (res?.data || [])
      .filter((c) => c.futureType === 1 && c.state === 0 && c.quoteCoin === 'USDT')
      .map((c) => ({ symbol: c.symbol, base: c.baseCoin, quote: c.quoteCoin }));
  } catch (err) {
    console.warn('fetchMexcContracts error', err);
    return [];
  }
}

export async function fetchMexcTicker(symbol: string): Promise<MexcPairDetail | null> {
  try {
    const res = (await makeRequest(
      `${MEXC_FUTURES_API}/contract/ticker?symbol=${encodeURIComponent(symbol)}`,
    )) as MexcTickerResponse;
    const t = res?.data;
    if (!t || !(t.lastPrice > 0)) return null;
    return {
      symbol,
      price: t.lastPrice,
      priceChange: t.riseFallValue,
      priceChangePercent: t.riseFallRate * 100,
      highPrice: t.high24Price,
      lowPrice: t.lower24Price,
      volume: t.volume24,
      quoteVolume: t.amount24,
    };
  } catch (err) {
    console.warn('fetchMexcTicker error', symbol, err);
    return null;
  }
}

function toBinanceRows(data: MexcKlineResponse['data']): unknown[][] {
  const n = data?.time?.length ?? 0;
  const rows: unknown[][] = [];
  for (let i = n - 1; i >= 0; i--) {
    rows.unshift([
      (data.time[i] ?? 0) * 1000,
      data.open?.[i] ?? 0,
      data.high?.[i] ?? 0,
      data.low?.[i] ?? 0,
      data.close?.[i] ?? 0,
      data.vol?.[i] ?? 0,
      0,
      0,
      0,
      0,
      0,
      0,
    ]);
  }
  return rows;
}

function numAt(row: unknown[], index: number): number {
  const v = row[index];
  return typeof v === 'number' ? v : Number(v ?? 0) || 0;
}

// Buckets anclados a calendario, no al indice; si no los bordes bailan cada fetch.
export function aggregateMexcRows(
  rows: unknown[][],
  factor: number,
  mexcInterval: string,
): unknown[][] {
  if (factor <= 1 || rows.length === 0) return rows;
  const chunkDurMs = (MEXC_BASE_DURATION_MS[mexcInterval] ?? 0) * factor;
  if (chunkDurMs <= 0) return rows;
  const weekAnchored = mexcInterval === 'Week1';
  const buckets = new Map<number, unknown[][]>();
  for (const row of rows) {
    const t = numAt(row, 0);
    const key = weekAnchored ? t - ((t - WEEK_ANCHOR_MS) % chunkDurMs) : t - (t % chunkDurMs);
    const bucket = buckets.get(key);
    if (bucket) bucket.push(row);
    else buckets.set(key, [row]);
  }
  const out: unknown[][] = [];
  for (const [key, bucket] of buckets) {
    let high = -Infinity;
    let low = Infinity;
    let volume = 0;
    for (const row of bucket) {
      const h = numAt(row, 2);
      const l = numAt(row, 3);
      if (h > high) high = h;
      if (l < low) low = l;
      volume += numAt(row, 5);
    }
    const first = bucket[0]!;
    const last = bucket[bucket.length - 1]!;
    out.push([key, numAt(first, 1), high, low, numAt(last, 4), volume, 0, 0, 0, 0, 0, 0]);
  }
  return out;
}

export async function fetchMexcKlines(
  symbol: string,
  interval: string,
  opts: { startSec?: number | null; singlePage?: boolean } = {},
): Promise<unknown[][]> {
  const { mexcInterval, factor } = mexcKlinePlan(interval);
  const pageCount = opts.singlePage ? 1 : chartPageCountForInterval(interval);
  const allRows: unknown[][] = [];
  let end: number | null = null;
  let pagesFetched = 0;

  try {
    while (pagesFetched < pageCount) {
      const params = new URLSearchParams({ interval: mexcInterval });
      if (opts.startSec != null) params.set('start', String(opts.startSec));
      if (end != null) params.set('end', String(end));
      const res = (await makeRequest(
        `${MEXC_FUTURES_API}/contract/kline/${encodeURIComponent(symbol)}?${params}`,
      )) as MexcKlineResponse;
      const data = res?.data;
      const n = data?.time?.length ?? 0;
      if (n === 0) break;
      allRows.unshift(...toBinanceRows(data));
      end = (data.time[0] ?? 0) - 1;
      pagesFetched++;
      if (opts.singlePage || n < MEXC_KLINE_PAGE_SIZE) break;
    }
  } catch (err) {
    console.warn('fetchMexcKlines error', symbol, err);
    return allRows;
  }

  return aggregateMexcRows(allRows, factor, mexcInterval);
}

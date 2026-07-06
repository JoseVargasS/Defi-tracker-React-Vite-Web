import { BINANCE_API, COINSTATS_API } from '@/lib/config';
import { makeRequest } from '@/api/client';
import { fetchPrice } from '@/api/binance';

const STABLE_PRICES: Record<string, number> = {
  USDT: 1,
  USDC: 1,
  USD0: 1,
  DAI: 1,
};

function normalizeSymbol(symbol: string): string {
  return String(symbol || '')
    .replace(/[^a-zA-Z0-9]/g, '')
    .toUpperCase();
}

function isValidSymbol(symbol: string): boolean {
  const s = normalizeSymbol(symbol);
  return Boolean(s && s !== '?' && s !== 'ERC20');
}

async function fetchBinanceUsdtPrice(symbol: string): Promise<number | null> {
  const pair = `${symbol}USDT`;
  const result = await fetchPrice(pair);
  if (!result) return null;
  const price = Number.parseFloat(result.price);
  return Number.isFinite(price) && price > 0 ? price : null;
}

async function fetchCoinStatsPrice(symbol: string): Promise<number | null> {
  try {
    const data = (await makeRequest(
      `${COINSTATS_API}/coins?symbol=${encodeURIComponent(symbol)}&limit=1`,
    )) as { result?: { price?: string }[] } | null;
    if (data?.result?.length) return Number(data.result[0]!.price) || null;
    return null;
  } catch {
    return null;
  }
}

export async function getTokenPriceUSD(
  symbol: string,
): Promise<number | null> {
  if (!isValidSymbol(symbol)) return null;

  const s = normalizeSymbol(symbol);
  if (STABLE_PRICES[s] !== undefined) return STABLE_PRICES[s]!;

  const price = await fetchBinanceUsdtPrice(s);
  if (price !== null) return price;

  return fetchCoinStatsPrice(s);
}

export async function getHistoricalTokenPriceUSD(
  symbol: string,
  date: Date | number,
): Promise<number | null> {
  if (!isValidSymbol(symbol)) return null;

  const s = normalizeSymbol(symbol);
  if (STABLE_PRICES[s] !== undefined) return STABLE_PRICES[s];

  try {
    const pair = `${s}USDT`;
    const res = (await makeRequest(
      `${BINANCE_API}/klines?symbol=${pair}&interval=1d&limit=365`,
    )) as unknown[][] | null;
    if (Array.isArray(res) && res.length) {
      const targetMs = date instanceof Date ? date.getTime() : Number(date);
      let closest: unknown[] | null = null;
      let minDiff = Infinity;
      for (const k of res) {
        const diff = Math.abs(Number(k[0]) - targetMs);
        if (diff < minDiff) {
          minDiff = diff;
          closest = k;
        }
      }
      if (closest) {
        const close = Number(closest[4]);
        if (Number.isFinite(close) && close > 0) return close;
      }
    }
  } catch {
    /* return null */
  }

  return null;
}

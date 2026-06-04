// js/exchange.js
import { BINANCE_API } from './config.js';
import { makeRequest } from './utils.js';
import { state } from './state.js';
import { STORAGE_KEYS } from './storage.js';

// ── In-memory cache for klines (60s TTL) ──────────────────────────────────────
const _klinesCache = new Map();
const KLINES_TTL = 60_000;

// ── Single-price fetch ─────────────────────────────────────────────────────────
export async function fetchPrice(symbol) {
  try {
    const res = await makeRequest(`${BINANCE_API}/ticker/price?symbol=${symbol}`);
    return res.price;
  } catch {
    return '0.00';
  }
}

// ── Single 24h stats ───────────────────────────────────────────────────────────
export async function fetch24hStats(symbol) {
  try {
    const res = await makeRequest(`${BINANCE_API}/ticker/24hr?symbol=${symbol}`);
    return res;
  } catch {
    return {};
  }
}

// ── Batch price fetch (ONE request for multiple symbols) ──────────────────────
// Returns { BTCUSDT: "84000.00", ETHBTC: "0.03", ... }
export async function fetchPriceBatch(symbols) {
  if (!symbols || symbols.length === 0) return {};
  try {
    const param = encodeURIComponent(JSON.stringify(symbols));
    const res = await makeRequest(`${BINANCE_API}/ticker/price?symbols=${param}`);
    const map = {};
    if (Array.isArray(res)) {
      for (const item of res) map[item.symbol] = item.price;
    }
    return map;
  } catch {
    return {};
  }
}

// ── Batch 24h stats fetch (ONE request for multiple symbols) ──────────────────
export async function fetch24hStatsBatch(symbols) {
  if (!symbols || symbols.length === 0) return {};
  try {
    const param = encodeURIComponent(JSON.stringify(symbols));
    const res = await makeRequest(`${BINANCE_API}/ticker/24hr?symbols=${param}`);
    const map = {};
    if (Array.isArray(res)) {
      for (const item of res) map[item.symbol] = item;
    }
    return map;
  } catch {
    return {};
  }
}

// ── Klines aggregation helper ──────────────────────────────────────────────────
function aggregateKlines(rawKlines, groupSize) {
  const aggregated = [];
  for (let i = 0; i < rawKlines.length; i += groupSize) {
    const chunk = rawKlines.slice(i, i + groupSize);
    const openTime = chunk[0][0];
    const closeTime = chunk[chunk.length - 1][6];
    const open = parseFloat(chunk[0][1]);
    const close = parseFloat(chunk[chunk.length - 1][4]);
    let high = -Infinity;
    let low = Infinity;
    let volume = 0;
    let quoteVolume = 0;

    for (const candle of chunk) {
      const h = parseFloat(candle[2]);
      const l = parseFloat(candle[3]);
      if (h > high) high = h;
      if (l < low) low = l;
      volume += parseFloat(candle[5] ?? 0);
      quoteVolume += parseFloat(candle[7] ?? 0);
    }

    aggregated.push([
      openTime,
      open.toString(),
      high.toString(),
      low.toString(),
      close.toString(),
      volume.toString(),
      closeTime,
      quoteVolume.toString()
    ]);
  }
  return aggregated;
}

// ── fetchKlines with in-memory cache ──────────────────────────────────────────
export async function fetchKlines(symbol, interval) {
  const intervalMap = {
    '3M': '1M', '1M': '1M', '1w': '1w', '5d': '1d',
    '3d': '3d', '1d': '1d', '12h': '12h', '4h': '4h',
    '1h': '1h', '15m': '15m', '5m': '5m', '1m': '1m'
  };
  const qInterval = intervalMap[interval] || '1d';
  const cacheKey = `${symbol}-${interval}`;
  const now = Date.now();

  // Return cached data if fresh
  const cached = _klinesCache.get(cacheKey);
  if (cached && now - cached.ts < KLINES_TTL) return cached.data;

  try {
    const res = await makeRequest(`${BINANCE_API}/klines?symbol=${symbol}&interval=${qInterval}&limit=1000`);
    let klines = res;
    if (interval === '3M') klines = aggregateKlines(klines, 3);
    else if (interval === '5d') klines = aggregateKlines(klines, 5);

    _klinesCache.set(cacheKey, { data: klines, ts: now });
    return klines;
  } catch (e) {
    console.error('fetchKlines error', e);
    return [];
  }
}

// ── Invalidate klines cache entry (call when switching pair/interval) ──────────
// ── fetchCoinsList with 24h localStorage cache ─────────────────────────────────
const COINS_CACHE_TTL = 24 * 60 * 60 * 1000;

export async function fetchCoinsList() {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.coinsListCache);
    if (raw) {
      const { ts, data } = JSON.parse(raw);
      const hasNonUsdtPairs = Array.isArray(data) && data.some(item => item?.quote && item.quote !== 'USDT');
      if (Array.isArray(data) && hasNonUsdtPairs && Date.now() - ts < COINS_CACHE_TTL) {
        state.coinsList = data;
        return;
      }
    }
    const res = await makeRequest(`${BINANCE_API}/exchangeInfo`);
    state.coinsList = (res.symbols || [])
      .filter(s => s.status === 'TRADING' && s.isSpotTradingAllowed)
      .map(s => ({ symbol: s.symbol, base: s.baseAsset, quote: s.quoteAsset }));
    localStorage.setItem(STORAGE_KEYS.coinsListCache, JSON.stringify({ ts: Date.now(), data: state.coinsList }));
  } catch (error) {
    console.error('Error fetching coins list:', error);
    state.coinsList = [];
  }
}

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fetchKlines, fetchLatestKlines, fetchPrice, fetch24hStats, fetch24hStatsBatch, fetchPriceBatch, fetchExchangeInfo, fetchCoinsList, _klinesCache } from '@/api/binance';
import { STORAGE_KEYS } from '@/lib/storage';

beforeEach(() => {
  _klinesCache.clear();
  vi.restoreAllMocks();
});

function makeKline(openTime: number, o = '100', h = '110', l = '90', c = '105', v = '1000', q = '100000'): unknown[] {
  return [openTime, o, h, l, c, v, openTime + 3600000, q, 100, '500', '50000', '0'];
}

describe('fetchPrice', () => {
  it('returns price on success', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ symbol: 'BTCUSDT', price: '65000.00' }),
    }));
    const result = await fetchPrice('BTCUSDT');
    expect(result).toEqual({ symbol: 'BTCUSDT', price: '65000.00' });
  });

  it('returns null on error', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network')));
    const result = await fetchPrice('BTCUSDT');
    expect(result).toBeNull();
  });
});

describe('fetch24hStats', () => {
  it('returns stats on success', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ symbol: 'BTCUSDT', priceChange: '100', priceChangePercent: '0.5', highPrice: '66000', lowPrice: '64000', volume: '1000', quoteVolume: '65000000' }),
    }));
    const result = await fetch24hStats('BTCUSDT');
    expect(result?.symbol).toBe('BTCUSDT');
  });

  it('returns null on error', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('fail')));
    const result = await fetch24hStats('BTCUSDT');
    expect(result).toBeNull();
  });
});

describe('fetchLatestKlines', () => {
  it('returns normalized klines on success', async () => {
    const klines = [makeKline(1000000), makeKline(2000000)];
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(klines),
    }));
    const result = await fetchLatestKlines('BTCUSDT', '1d', 2);
    expect(result.length).toBe(2);
  });

  it('returns empty on error', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('fail')));
    const result = await fetchLatestKlines('BTCUSDT', '1d', 2);
    expect(result).toEqual([]);
  });
});

describe('fetchKlines', () => {
  it('returns klines without aggregation for native interval', async () => {
    const klines = Array.from({ length: 5 }, (_, i) => makeKline(i * 1000));
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(klines),
    }));
    const result = await fetchKlines('BTCUSDT', '1d', 5);
    expect(result.length).toBe(5);
  });

  it('aggregates klines for 5d interval', async () => {
    const klines = Array.from({ length: 10 }, (_, i) =>
      makeKline(i * 86400000, '100', '110', '90', '105'),
    );
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(klines),
    }));
    const result = await fetchKlines('BTCUSDT', '5d', 10);
    expect(result.length).toBe(2);
    const first = result[0] as string[];
    expect(Number(first[2])).toBe(110);
    expect(Number(first[3])).toBe(90);
  });

  it('returns empty on error', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('fail')));
    const result = await fetchKlines('BTCUSDT', '1d', 5);
    expect(result).toEqual([]);
  });

  it('uses cache for repeated calls', async () => {
    const klines = [makeKline(1000)];
    const fetchSpy = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(klines),
    });
    vi.stubGlobal('fetch', fetchSpy);
    await fetchKlines('BTCUSDT', '1d', 1);
    await fetchKlines('BTCUSDT', '1d', 1);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it('aggregates klines for 3M interval', async () => {
    const klines = Array.from({ length: 9 }, (_, i) =>
      makeKline(i * 86400000 * 30, '100', '120', '80', '110'),
    );
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(klines),
    }));
    const result = await fetchKlines('BTCUSDT', '3M', 9);
    expect(result.length).toBe(3);
    const first = result[0] as string[];
    expect(Number(first[2])).toBe(120);
    expect(Number(first[3])).toBe(80);
  });

  it('returns empty when API returns empty array', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve([]),
    }));
    const result = await fetchKlines('BTCUSDT', '1d', 5);
    expect(result).toEqual([]);
  });
});

describe('fetchPriceBatch', () => {
  it('returns batch prices on success', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve([
        { symbol: 'BTCUSDT', price: '65000' },
        { symbol: 'ETHUSDT', price: '3000' },
      ]),
    }));
    const result = await fetchPriceBatch(['BTCUSDT', 'ETHUSDT']);
    expect(result.length).toBe(2);
  });

  it('returns empty for empty input', async () => {
    const result = await fetchPriceBatch([]);
    expect(result).toEqual([]);
  });

  it('returns empty on error', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('fail')));
    const result = await fetchPriceBatch(['BTCUSDT']);
    expect(result).toEqual([]);
  });
});

describe('fetch24hStatsBatch', () => {
  it('returns batch stats on success', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve([
        { symbol: 'BTCUSDT', priceChange: '100', priceChangePercent: '0.5', highPrice: '66000', lowPrice: '64000', volume: '1000', quoteVolume: '65000000' },
      ]),
    }));
    const result = await fetch24hStatsBatch(['BTCUSDT']);
    expect(result.length).toBe(1);
  });

  it('returns empty for empty input', async () => {
    const result = await fetch24hStatsBatch([]);
    expect(result).toEqual([]);
  });
});

describe('fetchExchangeInfo', () => {
  it('returns exchange info on success', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ symbols: [{ symbol: 'BTCUSDT' }] }),
    }));
    const result = await fetchExchangeInfo();
    expect(result?.symbols.length).toBe(1);
  });

  it('returns null on error', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('fail')));
    const result = await fetchExchangeInfo();
    expect(result).toBeNull();
  });
});

describe('fetchCoinsList', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('returns coins from API and caches', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({
        symbols: [
          { symbol: 'BTCUSDT', baseAsset: 'BTC', quoteAsset: 'USDT', status: 'TRADING', isSpotTradingAllowed: true },
          { symbol: 'ETHUSDT', baseAsset: 'ETH', quoteAsset: 'USDT', status: 'TRADING', isSpotTradingAllowed: true },
          { symbol: 'DELUSDT', baseAsset: 'DEL', quoteAsset: 'USDT', status: 'BREAK', isSpotTradingAllowed: false },
        ],
      }),
    }));
    const result = await fetchCoinsList();
    expect(result.length).toBe(2);
    expect(result[0].base).toBe('BTC');
  });

  it('returns cached data on subsequent calls', async () => {
    const fetchSpy = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({
        symbols: [{ symbol: 'BTCUSDT', baseAsset: 'BTC', quoteAsset: 'USDT', status: 'TRADING', isSpotTradingAllowed: true }],
      }),
    });
    vi.stubGlobal('fetch', fetchSpy);
    await fetchCoinsList();
    const cached = await fetchCoinsList();
    expect(cached.length).toBe(1);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it('returns empty on error', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('fail')));
    const result = await fetchCoinsList();
    expect(result).toEqual([]);
  });
});

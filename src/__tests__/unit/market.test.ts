import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/api/binance', () => ({
  fetch24hStats: vi.fn(),
  fetchPrice: vi.fn(),
  fetchKlines: vi.fn(),
  fetchLatestKlines: vi.fn(),
  getRecentCloses: vi.fn(),
  fetchCoinsList: vi.fn().mockResolvedValue([
    { symbol: 'BTCUSDT', base: 'BTC', quote: 'USDT' },
  ]),
}));

vi.mock('@/api/mexc', () => ({
  fetchMexcContracts: vi.fn().mockResolvedValue([
    { symbol: 'BTC_USDT', base: 'BTC', quote: 'USDT' },
  ]),
  fetchMexcTicker: vi.fn(),
  fetchMexcKlines: vi.fn(),
}));

import {
  displayBase,
  displayPairLabel,
  displayQuote,
  fetchAvailableSymbols,
  fetchCandles,
  fetchExtendedFlag,
  fetchLatestCandles,
  fetchPairDetail,
  filterAvailableSymbols,
  filterAvailableSymbolsGrouped,
} from '@/api/market';
import { fetch24hStats, fetchKlines, fetchLatestKlines, fetchPrice, getRecentCloses } from '@/api/binance';
import { fetchMexcKlines, fetchMexcTicker } from '@/api/mexc';

const mockedStats = vi.mocked(fetch24hStats);
const mockedPrice = vi.mocked(fetchPrice);
const mockedKlines = vi.mocked(fetchKlines);
const mockedLatest = vi.mocked(fetchLatestKlines);
const mockedMexcTicker = vi.mocked(fetchMexcTicker);
const mockedMexcKlines = vi.mocked(fetchMexcKlines);

beforeEach(() => {
  vi.clearAllMocks();
});

describe('displayPairLabel', () => {
  it('formats spot as base/quote', () => {
    expect(displayPairLabel('SUIUSDT')).toBe('SUI/USDT');
  });

  it('formats perps concatenated', () => {
    expect(displayPairLabel('SUI_USDT-MEXC')).toBe('SUIUSDT');
  });

  it('keeps TV symbols raw', () => {
    expect(displayPairLabel('BTC.D-TV')).toBe('BTC.D');
  });
});

describe('displayBase/displayQuote', () => {
  it('splits Binance symbols', () => {
    expect(displayBase('BTCUSDT')).toBe('BTC');
    expect(displayQuote('BTCUSDT')).toBe('USDT');
  });

  it('splits MEXC symbols on underscore', () => {
    expect(displayBase('BTC_USDT-MEXC')).toBe('BTC');
    expect(displayQuote('BTC_USDT-MEXC')).toBe('USDT');
  });

  it('keeps TV symbols raw', () => {
    expect(displayBase('BTC.D-TV')).toBe('BTC.D');
    expect(displayQuote('BTC.D-TV')).toBe('');
  });
});

describe('fetchAvailableSymbols', () => {
  it('merges Binance, MEXC and TV lists', async () => {
    const list = await fetchAvailableSymbols();
    expect(list.some((s) => s.symbol === 'BTCUSDT' && s.source === 'Binance')).toBe(true);
    expect(list.some((s) => s.symbol === 'BTC_USDT' && s.source === 'MEXC')).toBe(true);
    expect(list.some((s) => s.symbol === 'TOTAL' && s.source === 'TV')).toBe(true);
  });
});

describe('filterAvailableSymbols', () => {
  it('matches by symbol, pair and keywords', async () => {
    const list = await fetchAvailableSymbols();
    expect(filterAvailableSymbols(list, 'btc').length).toBeGreaterThan(0);
    expect(filterAvailableSymbols(list, 'TOTAL')).toHaveLength(3);
    expect(filterAvailableSymbols(list, '   ')).toEqual([]);
  });
});

describe('filterAvailableSymbolsGrouped', () => {
  it('orders futures first, then spot, then indices', async () => {
    const list = await fetchAvailableSymbols();
    const groups = filterAvailableSymbolsGrouped(list, 'btc', 7);
    expect(groups.map((g) => g.source)).toEqual(
      [...groups.map((g) => g.source)].sort(
        (a, b) => ['MEXC', 'Binance', 'TV'].indexOf(a) - ['MEXC', 'Binance', 'TV'].indexOf(b),
      ),
    );
    expect(groups[0]?.title).toBe('Futuros perpetuos');
  });

  it('returns empty groups for blank query', async () => {
    const list = await fetchAvailableSymbols();
    expect(filterAvailableSymbolsGrouped(list, '   ')).toEqual([]);
  });
});

describe('fetchExtendedFlag', () => {
  const mockedCloses = vi.mocked(getRecentCloses);

  it('returns true when a recent daily close is sub-dollar', async () => {
    mockedCloses.mockResolvedValue([65000, 0.5]);
    expect(await fetchExtendedFlag('BTCUSDT')).toBe(true);
  });

  it('returns false when all closes are above a dollar', async () => {
    mockedCloses.mockResolvedValue([65000, 64000]);
    expect(await fetchExtendedFlag('BTCUSDT')).toBe(false);
  });

  it('returns false for TV symbols', async () => {
    expect(await fetchExtendedFlag('TOTAL-TV')).toBe(false);
    expect(mockedKlines).not.toHaveBeenCalled();
  });

  it('checks MEXC daily klines', async () => {
    mockedMexcKlines.mockResolvedValue([[1, 1, 2, 0.4, 0.5, 10, 0, 0, 0, 0, 0, 0]]);
    expect(await fetchExtendedFlag('BTC_USDT-MEXC')).toBe(true);
  });
});

describe('fetchPairDetail', () => {
  it('combines Binance stats and price', async () => {
    mockedStats.mockResolvedValue({
      symbol: 'BTCUSDT', priceChange: '100', priceChangePercent: '2.5',
      highPrice: '66000', lowPrice: '64000', volume: '100', quoteVolume: '6500000',
    });
    mockedPrice.mockResolvedValue({ symbol: 'BTCUSDT', price: '65000' });
    const detail = await fetchPairDetail('BTCUSDT');
    expect(detail?.price).toBe(65000);
    expect(detail?.priceChangePercent).toBe(2.5);
  });

  it('returns MEXC ticker mapped', async () => {
    mockedMexcTicker.mockResolvedValue({
      symbol: 'BTC_USDT', price: 65000, priceChange: 100, priceChangePercent: 1.5,
      highPrice: 66000, lowPrice: 63000, volume: 10, quoteVolume: 650000,
    });
    const detail = await fetchPairDetail('BTC_USDT-MEXC');
    expect(detail?.source).toBe('MEXC');
    expect(detail?.price).toBe(65000);
  });

  it('returns null for TV for now', async () => {
    expect(await fetchPairDetail('TOTAL-TV')).toBeNull();
  });
});

describe('fetchCandles/fetchLatestCandles', () => {
  it('dispatches Binance entries to spot klines', async () => {
    mockedKlines.mockResolvedValue([[1, 2, 3]]);
    mockedLatest.mockResolvedValue([[1, 2, 3]]);
    await fetchCandles('BTCUSDT', '1d', 5);
    expect(mockedKlines).toHaveBeenCalledWith('BTCUSDT', '1d', 5);
    await fetchLatestCandles('BTCUSDT', '1d', 2);
    expect(mockedLatest).toHaveBeenCalledWith('BTCUSDT', '1d', 2);
  });

  it('dispatches MEXC entries to futures klines', async () => {
    mockedMexcKlines.mockResolvedValue([]);
    await fetchCandles('BTC_USDT-MEXC', '1h');
    expect(mockedMexcKlines).toHaveBeenCalled();
  });

  it('returns empty for TV entries', async () => {
    expect(await fetchCandles('TOTAL-TV', '1d')).toEqual([]);
    expect(await fetchLatestCandles('TOTAL-TV', '1d')).toEqual([]);
  });
});

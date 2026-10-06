import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/api/client', () => ({
  makeRequest: vi.fn(),
}));

import { aggregateMexcRows, fetchMexcContracts, fetchMexcKlines, fetchMexcTicker } from '@/api/mexc';
import { makeRequest } from '@/api/client';

const mockedMakeRequest = vi.mocked(makeRequest);

beforeEach(() => {
  vi.clearAllMocks();
});

describe('fetchMexcContracts', () => {
  it('keeps only USDT perpetual futures', async () => {
    mockedMakeRequest.mockResolvedValue({
      success: true,
      code: 0,
      data: [
        { symbol: 'BTC_USDT', baseCoin: 'BTC', quoteCoin: 'USDT', settleCoin: 'USDT', futureType: 1, state: 0 },
        { symbol: 'ETH_BTC', baseCoin: 'ETH', quoteCoin: 'BTC', settleCoin: 'BTC', futureType: 1, state: 0 },
        { symbol: 'SOL_USDT', baseCoin: 'SOL', quoteCoin: 'USDT', settleCoin: 'USDT', futureType: 2, state: 0 },
        { symbol: 'DOGE_USDT', baseCoin: 'DOGE', quoteCoin: 'USDT', settleCoin: 'USDT', futureType: 1, state: 1 },
      ],
    });
    const result = await fetchMexcContracts();
    expect(result).toEqual([{ symbol: 'BTC_USDT', base: 'BTC', quote: 'USDT' }]);
  });

  it('returns empty on error', async () => {
    mockedMakeRequest.mockRejectedValue(new Error('network'));
    expect(await fetchMexcContracts()).toEqual([]);
  });
});

describe('fetchMexcTicker', () => {
  it('maps riseFallRate fraction to percent', async () => {
    mockedMakeRequest.mockResolvedValue({
      success: true,
      code: 0,
      data: {
        symbol: 'BTC_USDT', lastPrice: 65000, riseFallRate: 0.02, riseFallValue: 1300,
        high24Price: 66000, lower24Price: 63000, volume24: 100, amount24: 6500000,
      },
    });
    const result = await fetchMexcTicker('BTC_USDT');
    expect(result?.priceChangePercent).toBeCloseTo(2);
    expect(result?.price).toBe(65000);
  });

  it('returns null when lastPrice is zero', async () => {
    mockedMakeRequest.mockResolvedValue({ success: true, code: 0, data: { lastPrice: 0 } });
    expect(await fetchMexcTicker('BTC_USDT')).toBeNull();
  });
});

describe('fetchMexcKlines', () => {
  it('converts columnar seconds to ms rows', async () => {
    mockedMakeRequest.mockResolvedValue({
      success: true,
      code: 0,
      data: { time: [1700000000], open: [100], close: [105], high: [110], low: [95], vol: [10] },
    });
    const rows = await fetchMexcKlines('BTC_USDT', '1m', { singlePage: true });
    expect(rows[0]?.[0]).toBe(1700000000 * 1000);
    expect(rows[0]?.[4]).toBe(105);
  });

  it('returns partial rows on error after first page', async () => {
    mockedMakeRequest.mockRejectedValue(new Error('fail'));
    expect(await fetchMexcKlines('BTC_USDT', '1m')).toEqual([]);
  });
});

describe('aggregateMexcRows', () => {
  function row(t: number, o = 100, h = 110, l = 90, c = 105, v = 10): unknown[] {
    return [t, o, h, l, c, v, 0, 0, 0, 0, 0, 0];
  }

  it('returns rows untouched when factor is 1', () => {
    const rows = [row(60_000), row(120_000)];
    expect(aggregateMexcRows(rows, 1, 'Min1')).toBe(rows);
  });

  it('aggregates 2x Min60 into calendar buckets', () => {
    const rows = [row(0, 100, 110, 90, 102, 5), row(3_600_000, 102, 115, 95, 108, 7)];
    const out = aggregateMexcRows(rows, 2, 'Min60');
    expect(out).toHaveLength(1);
    expect(out[0]?.[2]).toBe(115);
    expect(out[0]?.[3]).toBe(90);
    expect(out[0]?.[5]).toBe(12);
  });
});

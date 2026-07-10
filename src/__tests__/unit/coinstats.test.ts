import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getTokenAssetsByAddress, getWalletTransactions, fetchBaseTransactions, fetchCoinStatsTokenPrice } from '@/api/coinstats';

beforeEach(() => {
  vi.restoreAllMocks();
});

describe('getTokenAssetsByAddress', () => {
  it('returns result array from object response', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ result: [{ symbol: 'ETH', amount: 1, price: 3000 }] }),
    }));
    const result = await getTokenAssetsByAddress('0xabc');
    expect(result?.result.length).toBe(1);
    expect(result?.result[0].symbol).toBe('ETH');
  });

  it('wraps array response into result object', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve([{ symbol: 'BTC', amount: 0.5 }]),
    }));
    const result = await getTokenAssetsByAddress('0xabc');
    expect(result?.result.length).toBe(1);
  });

  it('returns empty result for unexpected shape', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve('unexpected'),
    }));
    const result = await getTokenAssetsByAddress('0xabc');
    expect(result?.result).toEqual([]);
  });

  it('returns null on error', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('fail')));
    const result = await getTokenAssetsByAddress('0xabc');
    expect(result).toBeNull();
  });

  it('returns null when data is null', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(null),
    }));
    const result = await getTokenAssetsByAddress('0xabc');
    expect(result).toBeNull();
  });
});

describe('fetchCoinStatsTokenPrice', () => {
  it('returns price from valid response', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ result: [{ price: '1.23', symbol: 'XYZ' }] }),
    }));
    const result = await fetchCoinStatsTokenPrice('XYZ');
    expect(result).toEqual({ price: 1.23 });
  });

  it('returns null for empty result', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ result: [] }),
    }));
    const result = await fetchCoinStatsTokenPrice('XYZ');
    expect(result).toBeNull();
  });

  it('returns null on error', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('fail')));
    const result = await fetchCoinStatsTokenPrice('XYZ');
    expect(result).toBeNull();
  });
});

describe('getWalletTransactions', () => {
  it('returns transaction response', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ result: [{ hash: { id: '0x123' } }] }),
    }));
    const result = await getWalletTransactions('0xabc', 'base-wallet');
    expect(result?.result.length).toBe(1);
  });

  it('returns null on error', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('fail')));
    const result = await getWalletTransactions('0xabc', 'base-wallet');
    expect(result).toBeNull();
  });

  it('returns empty result for unexpected shape', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve('unexpected'),
    }));
    const result = await getWalletTransactions('0xabc', 'base-wallet');
    expect(result).toEqual({ result: [] });
  });
});

describe('fetchBaseTransactions', () => {
  it('flattens transactions with inner items', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({
        result: [{
          hash: { id: '0x123' },
          date: '2024-01-01T00:00:00Z',
          transactions: [{
            items: [{
              fromAddress: '0x111',
              toAddress: '0x222',
              coin: { symbol: 'ETH', icon: 'icon.png' },
              count: 100,
            }],
          }],
        }],
      }),
    }));
    const result = await fetchBaseTransactions('0xabc');
    expect(result.length).toBe(1);
    expect((result[0] as any).tokenSymbol).toBe('ETH');
    expect((result[0] as any).value).toBe(100);
  });

  it('flattens transactions without inner items (coinData)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({
        result: [{
          hash: { id: '0x456' },
          date: '2024-01-01T00:00:00Z',
          coinData: { symbol: 'USDC', count: 50 },
          mainContent: { coinIcons: ['usdc.png'] },
        }],
      }),
    }));
    const result = await fetchBaseTransactions('0xabc');
    expect(result.length).toBe(1);
    expect((result[0] as any).tokenSymbol).toBe('USDC');
  });

  it('returns empty array on error', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('fail')));
    const result = await fetchBaseTransactions('0xabc');
    expect(result).toEqual([]);
  });

  it('returns empty array when result is null', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(null),
    }));
    const result = await fetchBaseTransactions('0xabc');
    expect(result).toEqual([]);
  });
});

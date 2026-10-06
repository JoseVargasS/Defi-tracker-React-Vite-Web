import { describe, it, expect, vi, beforeEach } from 'vitest';
import { coinStatsTxError, fetchChainTransactions, fetchCoinStatsTokenPrice, getTokenAssetsByAddress } from '@/api/coinstats';

vi.mock('@/api/client', () => ({
  makeRequest: vi.fn(),
}));

import { makeRequest } from '@/api/client';
const mockedMakeRequest = vi.mocked(makeRequest);

beforeEach(() => {
  vi.clearAllMocks();
});

describe('getTokenAssetsByAddress', () => {
  it('returns result array from object response', async () => {
    mockedMakeRequest.mockResolvedValue({ result: [{ symbol: 'ETH', amount: 1, price: 3000 }] });
    const result = await getTokenAssetsByAddress('0xabc');
    expect(result?.result.length).toBe(1);
    expect(result?.result[0].symbol).toBe('ETH');
  });

  it('wraps array response into result object', async () => {
    mockedMakeRequest.mockResolvedValue([{ symbol: 'BTC', amount: 0.5 }]);
    const result = await getTokenAssetsByAddress('0xabc');
    expect(result?.result.length).toBe(1);
  });

  it('returns empty result for unexpected shape', async () => {
    mockedMakeRequest.mockResolvedValue('unexpected');
    const result = await getTokenAssetsByAddress('0xabc');
    expect(result?.result).toEqual([]);
  });

  it('returns null on error', async () => {
    mockedMakeRequest.mockRejectedValue(new Error('fail'));
    const result = await getTokenAssetsByAddress('0xabc');
    expect(result).toBeNull();
  });

  it('returns null when data is null', async () => {
    mockedMakeRequest.mockResolvedValue(null);
    const result = await getTokenAssetsByAddress('0xabc');
    expect(result).toBeNull();
  });
});

describe('fetchCoinStatsTokenPrice', () => {
  it('returns price from valid response', async () => {
    mockedMakeRequest.mockResolvedValue({ result: [{ price: '1.23', symbol: 'XYZ' }] });
    const result = await fetchCoinStatsTokenPrice('XYZ');
    expect(result).toEqual({ price: 1.23 });
  });

  it('returns null for empty result', async () => {
    mockedMakeRequest.mockResolvedValue({ result: [] });
    const result = await fetchCoinStatsTokenPrice('XYZ');
    expect(result).toBeNull();
  });

  it('returns null on error', async () => {
    mockedMakeRequest.mockRejectedValue(new Error('fail'));
    const result = await fetchCoinStatsTokenPrice('XYZ');
    expect(result).toBeNull();
  });
});

describe('coinStatsTxError', () => {
  it('maps auth failures to visible errors', () => {
    const err = new Error('HTTP 401') as Error & { status: number };
    err.status = 401;
    expect(coinStatsTxError(err)?.message).toContain('inválida');
  });

  it('maps rate limit to visible errors', () => {
    const err = new Error('HTTP 429') as Error & { status: number };
    err.status = 429;
    expect(coinStatsTxError(err)?.message).toContain('Límite');
  });

  it('returns null for other errors', () => {
    expect(coinStatsTxError(new Error('fail'))).toBeNull();
  });
});

describe('fetchChainTransactions', () => {
  it('syncs then maps inner items, skipping Fill records', async () => {
    mockedMakeRequest.mockImplementation(async (url: string) => {
      if (String(url).includes('wallet/status')) return { status: 'synced' };
      if (url === 'https://openapiv1.coinstats.app/wallet/transactions') return { status: 'syncing' };
      return {
        result: [
          { type: 'Fill', hash: { id: '0xfill' }, date: '2024-01-01T00:00:00Z' },
          {
            hash: { id: '0x123' },
            date: '2024-01-01T00:00:00Z',
            transactions: [{
              action: 'Received',
              items: [{
                fromAddress: '0x111',
                toAddress: '0xabc',
                coin: { symbol: 'ETH', icon: 'icon.png' },
                count: 100,
              }],
            }],
          },
        ],
      };
    });
    const result = await fetchChainTransactions('0xabc', 'base-wallet', 'Base', 100);
    expect(result).toHaveLength(1);
    expect(result[0]?.tokenSymbol).toBe('ETH');
    expect(result[0]?.value).toBe(100);
    expect(result[0]?._chainId).toBe('Base');
    expect(result[0]?.imgUrl).toBe('icon.png');
  });

  it('maps coinData fallback with abs count', async () => {
    mockedMakeRequest.mockImplementation(async (url: string) => {
      if (String(url).includes('wallet/status')) return { status: 'synced' };
      if (url === 'https://openapiv1.coinstats.app/wallet/transactions') return { status: 'synced' };
      return {
        result: [{
          type: 'Send',
          hash: { id: '0x456' },
          date: '2024-01-01T00:00:00Z',
          coinData: { symbol: 'USDC', count: -50 },
          mainContent: { coinIcons: ['usdc.png'] },
        }],
      };
    });
    const result = await fetchChainTransactions('0xabc2', 'ethereum', 'Ethereum', 100);
    expect(result).toHaveLength(1);
    expect(result[0]?.tokenSymbol).toBe('USDC');
    expect(result[0]?.value).toBe(50);
    expect(result[0]?.imgUrl).toBe('usdc.png');
  });

  it('treats 409 sync as syncing and waits', async () => {
    const err = new Error('HTTP 409') as Error & { status: number };
    err.status = 409;
    mockedMakeRequest.mockImplementation(async (url: string) => {
      if (url === 'https://openapiv1.coinstats.app/wallet/transactions') throw err;
      if (String(url).includes('wallet/status')) return { status: 'synced' };
      return { result: [] };
    });
    const result = await fetchChainTransactions('0xabc3', 'ethereum', 'Ethereum', 5);
    expect(result).toEqual([]);
  });

  it('throws visible auth errors', async () => {
    const err = new Error('HTTP 401') as Error & { status: number };
    err.status = 401;
    mockedMakeRequest.mockRejectedValue(err);
    await expect(fetchChainTransactions('0xabc4', 'ethereum', 'Ethereum', 5)).rejects.toThrow('inválida');
  });
});

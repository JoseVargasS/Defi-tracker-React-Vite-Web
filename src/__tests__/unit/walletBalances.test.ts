import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/config', async (importOriginal) => {
  const orig = await importOriginal<typeof import('@/lib/config')>();
  return {
    ...orig,
    WALLET_ADDRESS_RE: /^0x[a-fA-F0-9]{40}$/,
  HAS_COINSTATS_CONFIG: true,
  HAS_ETHERSCAN_CONFIG: false,
  BINANCE_API: 'https://api.binance.com',
  ETH_API: 'https://api.etherscan.io',
  ETH_KEY: '',
  CHAIN_FALLBACKS: {},
  STABLE_PRICES: { USDT: 1 },
  SUPPORTED_CHAINS: [
    { id: 'ethereum', name: 'Ether', icon: '' },
    { id: 'base-wallet', name: 'Base', icon: '' },
  ],
  WALLET_CHAIN_DELAY_MS: 0,
  BALANCE_DUST_THRESHOLD: 0.0001,
  };
});

vi.mock('@/lib/assets', () => ({
  TOKEN_ICON_FALLBACKS: {},
}));

vi.mock('@/api/client', () => ({
  makeRequest: vi.fn(),
}));

vi.mock('@/api/coinstats', () => ({
  getTokenAssetsByAddress: vi.fn(),
}));

import { fetchWalletAssets } from '@/api/wallet';
import { getTokenAssetsByAddress } from '@/api/coinstats';

const mockedBalances = vi.mocked(getTokenAssetsByAddress);
const ADDRESS = '0x' + 'a'.repeat(40);

beforeEach(() => {
  vi.clearAllMocks();
});

describe('fetchWalletAssets', () => {
  it('filters dust by value', async () => {
    mockedBalances.mockImplementation(async (_address: string, connectionId?: string) =>
      connectionId === 'ethereum'
        ? {
            result: [
              { name: 'Dust', symbol: 'DUST', amount: 0.00001, price: 1 },
              { name: 'Ether', symbol: 'ETH', amount: 1, price: 3000 },
            ],
          }
        : { result: [] },
    );
    const { assets, totalWorth } = await fetchWalletAssets(ADDRESS);
    expect(assets.map((a) => a.symbol)).toContain('ETH');
    expect(assets.map((a) => a.symbol)).not.toContain('DUST');
    expect(totalWorth).toBe(3000);
  });

  it('keeps tokens without price by amount', async () => {
    mockedBalances.mockImplementation(async (_address: string, connectionId?: string) =>
      connectionId === 'ethereum'
        ? { result: [{ name: 'NoPrice', symbol: 'NOP', amount: 5, price: null }] }
        : { result: [] },
    );
    const { assets } = await fetchWalletAssets(ADDRESS);
    expect(assets).toHaveLength(1);
    expect(assets[0]?.price).toBeNull();
  });

  it('surfaces auth errors instead of empty state', async () => {
    const err = new Error('HTTP 401');
    (err as Error & { status: number }).status = 401;
    mockedBalances.mockRejectedValue(err);
    await expect(fetchWalletAssets(ADDRESS)).rejects.toThrow('inválida o expirada');
  });

  it('surfaces rate limit errors', async () => {
    const err = new Error('HTTP 429');
    (err as Error & { status: number }).status = 429;
    mockedBalances.mockRejectedValue(err);
    await expect(fetchWalletAssets(ADDRESS)).rejects.toThrow('Límite');
  });

  it('queries chains sequentially in order', async () => {
    mockedBalances.mockResolvedValue({ result: [] });
    await fetchWalletAssets(ADDRESS);
    expect(mockedBalances.mock.calls.map((c) => c[1])).toEqual(['ethereum', 'base-wallet']);
  });
});

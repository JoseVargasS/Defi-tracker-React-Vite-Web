import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getTokenPriceUSD, getHistoricalTokenPriceUSD } from '@/api/prices';

beforeEach(() => {
  vi.restoreAllMocks();
});

describe('getTokenPriceUSD', () => {
  it('returns 1 for stablecoins', async () => {
    expect(await getTokenPriceUSD('USDT')).toBe(1);
    expect(await getTokenPriceUSD('USDC')).toBe(1);
    expect(await getTokenPriceUSD('USD0')).toBe(1);
    expect(await getTokenPriceUSD('DAI')).toBe(1);
  });

  it('returns null for invalid symbols', async () => {
    expect(await getTokenPriceUSD('')).toBeNull();
    expect(await getTokenPriceUSD('?')).toBeNull();
    expect(await getTokenPriceUSD('ERC20')).toBeNull();
  });

  it('fetches price from Binance first', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ symbol: 'BTCUSDT', price: '65000.00' }),
    }));
    const price = await getTokenPriceUSD('BTC');
    expect(price).toBe(65000);
  });

  it('falls back to CoinStats when Binance fails', async () => {
    let callCount = 0;
    vi.stubGlobal('fetch', vi.fn().mockImplementation(() => {
      callCount++;
      if (callCount === 1) {
        return Promise.resolve({
          ok: false,
          status: 400,
          statusText: 'Bad Request',
        });
      }
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ result: [{ price: '3000' }] }),
      });
    }));
    const price = await getTokenPriceUSD('ETH');
    expect(price).toBe(3000);
  });

  it('returns null when both sources fail', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('fail')));
    const price = await getTokenPriceUSD('XYZ');
    expect(price).toBeNull();
  });
});

describe('getHistoricalTokenPriceUSD', () => {
  it('returns 1 for stablecoins', async () => {
    expect(await getHistoricalTokenPriceUSD('USDT', new Date())).toBe(1);
  });

  it('returns null for invalid symbols', async () => {
    expect(await getHistoricalTokenPriceUSD('', new Date())).toBeNull();
    expect(await getHistoricalTokenPriceUSD('?', new Date())).toBeNull();
  });

  it('finds closest kline to target date', async () => {
    const now = Date.now();
    const klines = [
      [now - 86400000 * 2, '100', '110', '90', '105', '1000', now - 86400000, '100000', 100, '500', '50000', '0'],
      [now - 86400000, '105', '115', '95', '110', '1200', now, '120000', 100, '600', '60000', '0'],
    ];
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(klines),
    }));
    const price = await getHistoricalTokenPriceUSD('BTC', new Date(now - 86400000));
    expect(price).toBe(110);
  });

  it('returns null when API fails', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('fail')));
    const price = await getHistoricalTokenPriceUSD('BTC', new Date());
    expect(price).toBeNull();
  });

  it('returns null for empty klines response', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve([]),
    }));
    const price = await getHistoricalTokenPriceUSD('BTC', new Date());
    expect(price).toBeNull();
  });

  it('handles timestamp as number', async () => {
    const now = Date.now();
    const klines = [[now, '100', '110', '90', '105', '1000', now + 3600000, '100000', 100, '500', '50000', '0']];
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(klines),
    }));
    const price = await getHistoricalTokenPriceUSD('BTC', now);
    expect(price).toBe(105);
  });
});

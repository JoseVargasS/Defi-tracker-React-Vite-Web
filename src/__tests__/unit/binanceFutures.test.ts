import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/api/client', () => ({
  makeRequest: vi.fn(),
}));

import { fetchTakerVolumes } from '@/api/binanceFutures';
import { makeRequest } from '@/api/client';

const mockedMakeRequest = vi.mocked(makeRequest);

beforeEach(() => {
  vi.clearAllMocks();
});

describe('fetchTakerVolumes', () => {
  it('returns empty for non-native intervals', async () => {
    expect(await fetchTakerVolumes('BTCUSDT', '1m')).toEqual([]);
    expect(mockedMakeRequest).not.toHaveBeenCalled();
  });

  it('returns empty for TV source', async () => {
    expect(await fetchTakerVolumes('BTC', '1h', 'TV')).toEqual([]);
    expect(mockedMakeRequest).not.toHaveBeenCalled();
  });

  it('maps MEXC symbol stripping underscore', async () => {
    mockedMakeRequest.mockResolvedValue([
      { buyVol: '10.5', sellVol: '8.2', timestamp: 1700000000000 },
      { buyVol: null, sellVol: null, timestamp: 0 },
    ]);
    const result = await fetchTakerVolumes('BTC_USDT', '1h', 'MEXC', 10);
    expect(result).toEqual([{ timeMs: 1700000000000, buy: 10.5, sell: 8.2 }]);
    expect(String(mockedMakeRequest.mock.calls[0]?.[0])).toContain('symbol=BTCUSDT');
  });

  it('returns empty on error', async () => {
    mockedMakeRequest.mockRejectedValue(new Error('fail'));
    expect(await fetchTakerVolumes('BTCUSDT', '1h')).toEqual([]);
  });
});

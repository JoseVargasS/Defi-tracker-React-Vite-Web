import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getETHBalance, getTokenBalances, getTokenTransactions, getNormalTransactions, fetchEtherscanTransactions } from '@/api/etherscan';

vi.mock('@/api/client', () => ({
  makeRequest: vi.fn(),
}));

import { makeRequest } from '@/api/client';
const mockedMakeRequest = vi.mocked(makeRequest);

beforeEach(() => {
  vi.clearAllMocks();
});

describe('getETHBalance', () => {
  it('returns balance string on success', async () => {
    mockedMakeRequest.mockResolvedValue({ result: '1000000000000000000' });
    const result = await getETHBalance('0xabc');
    expect(result).toBe('1000000000000000000');
  });

  it('returns null on error', async () => {
    mockedMakeRequest.mockRejectedValue(new Error('fail'));
    const result = await getETHBalance('0xabc');
    expect(result).toBeNull();
  });

  it('returns null for non-string result', async () => {
    mockedMakeRequest.mockResolvedValue({ result: 12345 });
    const result = await getETHBalance('0xabc');
    expect(result).toBeNull();
  });
});

describe('getTokenTransactions', () => {
  it('returns token transactions on success', async () => {
    mockedMakeRequest.mockResolvedValue({ result: [{ tokenSymbol: 'USDT' }], status: '1' });
    const result = await getTokenTransactions('0xabc');
    expect(result?.result.length).toBe(1);
  });

  it('returns null on error', async () => {
    mockedMakeRequest.mockRejectedValue(new Error('fail'));
    const result = await getTokenTransactions('0xabc');
    expect(result).toBeNull();
  });
});

describe('getNormalTransactions', () => {
  it('returns normal transactions on success', async () => {
    mockedMakeRequest.mockResolvedValue({ result: [{ hash: '0x123' }], status: '1' });
    const result = await getNormalTransactions('0xabc');
    expect(result?.result.length).toBe(1);
  });

  it('returns null on error', async () => {
    mockedMakeRequest.mockRejectedValue(new Error('fail'));
    const result = await getNormalTransactions('0xabc');
    expect(result).toBeNull();
  });
});

describe('getTokenBalances', () => {
  it('computes balances from token transactions', async () => {
    const tokentx = {
      result: [
        {
          contractAddress: '0xtoken1',
          tokenName: 'Token1',
          tokenSymbol: 'T1',
          tokenDecimal: '18',
          value: '1000000000000000000',
          to: '0xabc',
          from: '0xother',
        },
        {
          contractAddress: '0xtoken1',
          tokenName: 'Token1',
          tokenSymbol: 'T1',
          tokenDecimal: '18',
          value: '500000000000000000',
          to: '0xother',
          from: '0xabc',
        },
      ],
    };
    mockedMakeRequest.mockResolvedValue(tokentx);
    const result = await getTokenBalances('0xabc');
    expect(result?.result.length).toBe(1);
    expect(result?.result[0].tokenSymbol).toBe('T1');
    expect(BigInt(result?.result[0].tokenBalance || '0')).toBe(BigInt('500000000000000000'));
  });

  it('returns empty result when no transactions', async () => {
    mockedMakeRequest.mockResolvedValue({ result: [] });
    const result = await getTokenBalances('0xabc');
    expect(result?.result).toEqual([]);
  });

  it('returns empty result on error', async () => {
    mockedMakeRequest.mockRejectedValue(new Error('fail'));
    const result = await getTokenBalances('0xabc');
    expect(result).toEqual({ result: [] });
  });

  it('returns null when result is null', async () => {
    mockedMakeRequest.mockResolvedValue(null);
    const result = await getTokenBalances('0xabc');
    expect(result?.result).toEqual([]);
  });
});

describe('fetchEtherscanTransactions', () => {
  it('merges tokentx and txlist results', async () => {
    mockedMakeRequest.mockImplementation((url: string) => {
      if (typeof url === 'string' && url.includes('tokentx')) {
        return Promise.resolve({ result: [{ hash: '0x1', tokenSymbol: 'USDT' }] });
      }
      return Promise.resolve({ result: [{ hash: '0x2' }] });
    });
    const result = await fetchEtherscanTransactions('0xabc');
    expect(result.length).toBe(2);
  });

  it('handles partial failures gracefully', async () => {
    mockedMakeRequest.mockImplementation((url: string) => {
      if (typeof url === 'string' && url.includes('tokentx')) {
        return Promise.reject(new Error('fail'));
      }
      return Promise.resolve({ result: [{ hash: '0x2' }] });
    });
    const result = await fetchEtherscanTransactions('0xabc');
    expect(result.length).toBe(1);
  });

  it('returns empty when both fail', async () => {
    mockedMakeRequest.mockRejectedValue(new Error('fail'));
    const result = await fetchEtherscanTransactions('0xabc');
    expect(result).toEqual([]);
  });
});

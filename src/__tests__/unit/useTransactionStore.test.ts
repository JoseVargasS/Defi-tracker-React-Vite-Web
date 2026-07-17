import { describe, it } from 'vitest';
import type { TransactionEntry } from '@/store/useTransactionStore';

describe('TransactionEntry type', () => {
  it('is a valid type with expected shape', () => {
    const entry: TransactionEntry = {
      hash: '0xabc',
      timestamp: 1700000000,
      tokenSymbol: 'ETH',
      tokenName: 'Ethereum',
      type: 'send',
      value: 1.5,
      usdValue: 3000,
      pnl: null,
      from: '0xfrom',
      to: '0xto',
    };
    expect(entry.hash).toBe('0xabc');
    expect(entry.tokenSymbol).toBe('ETH');
    expect(entry.type).toBe('send');
  });

  it('works with receive type', () => {
    const entry: TransactionEntry = {
      hash: '0xdef',
      timestamp: 1700000001,
      tokenSymbol: 'USDC',
      tokenName: 'USD Coin',
      type: 'receive',
      value: 100,
      usdValue: 100,
      pnl: 5,
      from: '0xfrom',
      to: '0xto',
      imgUrl: 'https://example.com/icon.png',
    };
    expect(entry.type).toBe('receive');
    expect(entry.pnl).toBe(5);
    expect(entry.imgUrl).toBeDefined();
  });
});

import { describe, it, expect, beforeEach } from 'vitest';
import { nextPairSort, useMarketStore } from '@/store/useMarketStore';

beforeEach(() => {
  useMarketStore.setState({ tracked: ['A', 'B', 'C'], pairSort: 'MANUAL', liveQuotes: {} });
});

describe('pair sort', () => {
  it('cycles through all modes back to manual', () => {
    expect(nextPairSort('MANUAL')).toBe('VOL_DESC');
    expect(nextPairSort('VOL_DESC')).toBe('VOL_ASC');
    expect(nextPairSort('VOL_ASC')).toBe('CHG_DESC');
    expect(nextPairSort('CHG_DESC')).toBe('CHG_ASC');
    expect(nextPairSort('CHG_ASC')).toBe('MANUAL');
  });

  it('cyclePairSort advances the store mode', () => {
    useMarketStore.getState().cyclePairSort();
    expect(useMarketStore.getState().pairSort).toBe('VOL_DESC');
  });
});

describe('moveTracked', () => {
  it('reorders entries', () => {
    useMarketStore.getState().moveTracked(0, 2);
    expect(useMarketStore.getState().tracked).toEqual(['B', 'C', 'A']);
  });

  it('ignores out of range moves', () => {
    useMarketStore.getState().moveTracked(0, 9);
    expect(useMarketStore.getState().tracked).toEqual(['A', 'B', 'C']);
  });
});

describe('setLiveQuotes', () => {
  it('merges batches by pair key', () => {
    useMarketStore.getState().setLiveQuotes({
      'BTCUSDT-Binance': { price: 65000, changePercent: 1, isPositive: true, quoteVolume: 5 },
    });
    useMarketStore.getState().setLiveQuotes({
      'BTC_USDT-MEXC': { price: 65010, changePercent: -1, isPositive: false, quoteVolume: 6 },
    });
    const quotes = useMarketStore.getState().liveQuotes;
    expect(quotes['BTCUSDT-Binance']?.price).toBe(65000);
    expect(quotes['BTC_USDT-MEXC']?.price).toBe(65010);
  });
});

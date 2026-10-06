import { describe, it, expect } from 'vitest';
import { liveQuoteFor, parseBinanceMiniTicker, parseMexcTickers } from '@/api/live';

describe('parseBinanceMiniTicker', () => {
  it('maps ticks keyed by symbol-Binance with percent from open', () => {
    const batch = parseBinanceMiniTicker({
      data: [
        { s: 'BTCUSDT', c: '66000', o: '64000', q: '1000000' },
        { s: 'BAD', c: '0', o: '0', q: '0' },
      ],
    });
    expect(batch['BTCUSDT-Binance']?.price).toBe(66000);
    expect(batch['BTCUSDT-Binance']?.changePercent).toBeCloseTo(3.125);
    expect(batch['BTCUSDT-Binance']?.isPositive).toBe(true);
    expect(batch['BAD-Binance']).toBeUndefined();
  });

  it('returns empty for malformed frames', () => {
    expect(parseBinanceMiniTicker({})).toEqual({});
    expect(parseBinanceMiniTicker(null)).toEqual({});
  });
});

describe('parseMexcTickers', () => {
  it('maps pushes keyed by symbol-MEXC with quoteVolume approx', () => {
    const batch = parseMexcTickers({
      channel: 'push.tickers',
      data: [{ symbol: 'BTC_USDT', lastPrice: 65000, riseFallRate: -0.01, volume24: 100 }],
    });
    expect(batch['BTC_USDT-MEXC']?.price).toBe(65000);
    expect(batch['BTC_USDT-MEXC']?.changePercent).toBeCloseTo(-1);
    expect(batch['BTC_USDT-MEXC']?.isPositive).toBe(false);
    expect(batch['BTC_USDT-MEXC']?.quoteVolume).toBe(6500000);
  });

  it('ignores other channels', () => {
    expect(parseMexcTickers({ channel: 'pong', data: [] })).toEqual({});
  });
});

describe('liveQuoteFor', () => {
  it('looks up by pair key', () => {
    const batch = { 'BTCUSDT-Binance': { price: 1, changePercent: 0, isPositive: true, quoteVolume: 0 } };
    expect(liveQuoteFor('Binance', 'BTCUSDT', batch)?.price).toBe(1);
    expect(liveQuoteFor('MEXC', 'BTCUSDT', batch)).toBeNull();
  });
});

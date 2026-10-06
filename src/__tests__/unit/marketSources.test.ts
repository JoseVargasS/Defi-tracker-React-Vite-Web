import { describe, it, expect } from 'vitest';
import {
  TV_INDEX_SYMBOLS,
  formatTrackedPair,
  hasNativeTakerInterval,
  mexcKlinePlan,
  pairKey,
  parseTrackedPair,
  sourceLabel,
  tvIndexHint,
  tvResolution,
  tvTicker,
} from '@/lib/config';

describe('tracked pair source helpers', () => {
  it('keeps legacy entries as Binance', () => {
    expect(parseTrackedPair('BTCUSDT')).toEqual({ symbol: 'BTCUSDT', source: 'Binance' });
  });

  it('parses suffixed entries', () => {
    expect(parseTrackedPair('BTC_USDT-MEXC')).toEqual({ symbol: 'BTC_USDT', source: 'MEXC' });
    expect(parseTrackedPair('BTC.D-TV')).toEqual({ symbol: 'BTC.D', source: 'TV' });
  });

  it('formats and keys pairs', () => {
    expect(formatTrackedPair('BTCUSDT', 'Binance')).toBe('BTCUSDT');
    expect(formatTrackedPair('BTC_USDT', 'MEXC')).toBe('BTC_USDT-MEXC');
    expect(pairKey('BTC_USDT', 'MEXC')).toBe('BTC_USDT-MEXC');
    expect(sourceLabel('MEXC')).toContain('MEXC');
  });
});

describe('mexcKlinePlan', () => {
  it('maps native intervals without aggregation', () => {
    expect(mexcKlinePlan('5m')).toEqual({ mexcInterval: 'Min5', factor: 1 });
  });

  it('aggregates higher timeframes', () => {
    expect(mexcKlinePlan('2h')).toEqual({ mexcInterval: 'Min60', factor: 2 });
    expect(mexcKlinePlan('2w')).toEqual({ mexcInterval: 'Week1', factor: 2 });
  });

  it('falls back for unknown intervals', () => {
    expect(mexcKlinePlan('99x')).toEqual({ mexcInterval: 'Min60', factor: 1 });
  });
});

describe('taker + tv helpers', () => {
  it('detects native taker intervals', () => {
    expect(hasNativeTakerInterval('1h')).toBe(true);
    expect(hasNativeTakerInterval('1m')).toBe(false);
  });

  it('hints every TV index in spanish', () => {
    for (const t of TV_INDEX_SYMBOLS) {
      expect(tvIndexHint(t.symbol).length).toBeGreaterThan(0);
    }
    expect(tvIndexHint('BTC.D')).toBe('Dominancia BTC');
    expect(tvIndexHint('TOTAL')).toBe('Cap. total mercado');
  });

  it('builds tv tickers and resolutions', () => {
    expect(tvTicker('TOTAL')).toBe('CRYPTOCAP:TOTAL');
    expect(tvTicker('CRYPTOCAP:TOTAL')).toBe('CRYPTOCAP:TOTAL');
    expect(tvResolution('1h')).toBe('60');
    expect(tvResolution('1d')).toBe('1D');
    expect(TV_INDEX_SYMBOLS).toHaveLength(13);
  });
});

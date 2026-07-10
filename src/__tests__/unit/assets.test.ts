import { describe, it, expect } from 'vitest';
import { COIN_ICON_URLS, TOKEN_ICON_FALLBACKS, coinDisplayName, tokenIconUrl } from '@/lib/assets';

describe('COIN_ICON_URLS', () => {
  it('contains BTC entry', () => {
    expect(COIN_ICON_URLS.BTC).toContain('bitcoin');
  });

  it('contains ETH entry', () => {
    expect(COIN_ICON_URLS.ETH).toContain('ethereum');
  });

  it('contains all expected keys', () => {
    const expected = ['BTC', 'ETH', 'BNB', 'SOL', 'ADA', 'XRP', 'DOGE', 'MATIC', 'DOT', 'LINK', 'LTC', 'TRX', 'SHIB', 'AVAX', 'USDC', 'USDT', 'PEPE', 'ARB', 'OP', 'BAT', 'BIO'];
    for (const key of expected) {
      expect(COIN_ICON_URLS[key]).toBeTruthy();
    }
  });
});

describe('TOKEN_ICON_FALLBACKS', () => {
  it('maps USUAL to coinstats URL', () => {
    expect(TOKEN_ICON_FALLBACKS.USUAL).toContain('coinstats');
  });

  it('maps ETH to local path', () => {
    expect(TOKEN_ICON_FALLBACKS.ETH).toContain('Eth-icon');
  });

  it('contains expected fallback keys', () => {
    const expected = ['USUAL', 'USUALX', 'USD0', 'BIO', 'ETH', 'BNB', 'USDC', 'USDT', 'SOL'];
    for (const key of expected) {
      expect(TOKEN_ICON_FALLBACKS[key]).toBeTruthy();
    }
  });
});

describe('coinDisplayName', () => {
  it('returns mapped name for known coins', () => {
    expect(coinDisplayName('BTC')).toBe('BTC');
    expect(coinDisplayName('ETH')).toBe('ETH');
    expect(coinDisplayName('USDT')).toBe('Tether');
    expect(coinDisplayName('SOL')).toBe('Solana');
    expect(coinDisplayName('DOGE')).toBe('Dogecoin');
    expect(coinDisplayName('MATIC')).toBe('Polygon');
  });

  it('returns base symbol for unknown coins', () => {
    expect(coinDisplayName('XYZ')).toBe('XYZ');
    expect(coinDisplayName('UNKNOWN')).toBe('UNKNOWN');
  });
});

describe('tokenIconUrl', () => {
  it('returns empty string for empty input', () => {
    expect(tokenIconUrl('')).toBe('');
  });

  it('returns fallback for known symbol', () => {
    const url = tokenIconUrl('ETH');
    expect(url).toContain('Eth-icon');
  });

  it('falls back to CDN for unknown symbols', () => {
    const url = tokenIconUrl('NEO');
    expect(url).toContain('cdn.jsdelivr.net');
    expect(url).toContain('neo.png');
  });

  it('normalizes to uppercase and trims', () => {
    const url = tokenIconUrl('  eth  ');
    expect(url).toContain('Eth-icon');
  });
});

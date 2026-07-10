import { describe, it, expect, beforeEach } from 'vitest';
import {
  readSavedWallets,
  writeSavedWallets,
  readTrackedPairs,
  writeTrackedPairs,
  readIndicatorColors,
  writeIndicatorColors,
  migrateAppStorage,
  clearAppStorage,
  STORAGE_KEYS,
} from '@/lib/storage';
import { APP_STORAGE_VERSION } from '@/lib/config';

const VALID_ADDRESS = '0x1234567890abcdef1234567890abcdef12345678';
const VALID_ADDRESS_2 = '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';

describe('wallet address validation', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('writeSavedWallets returns valid addresses for 0x + 40 hex chars', () => {
    const result = writeSavedWallets([VALID_ADDRESS]);
    expect(result).toEqual([VALID_ADDRESS]);
  });

  it('writeSavedWallets returns empty array for invalid addresses', () => {
    const result = writeSavedWallets(['invalid', '0xshort', '0xzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzz']);
    expect(result).toEqual([]);
  });

  it('readSavedWallets returns data written by writeSavedWallets', () => {
    writeSavedWallets([VALID_ADDRESS, VALID_ADDRESS_2]);
    const read = readSavedWallets();
    expect(read).toEqual([VALID_ADDRESS, VALID_ADDRESS_2]);
  });

  it('writeSavedWallets deduplicates wallets', () => {
    const result = writeSavedWallets([VALID_ADDRESS, VALID_ADDRESS]);
    expect(result).toEqual([VALID_ADDRESS]);
  });

  it('readSavedWallets returns empty array when nothing stored', () => {
    expect(readSavedWallets()).toEqual([]);
  });
});

describe('pair symbol validation', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('writeTrackedPairs saves valid uppercase pair symbols', () => {
    writeTrackedPairs(['ETHUSDT', 'BTCUSDT']);
    const read = readTrackedPairs();
    expect(read).toContain('ETHUSDT');
    expect(read).toContain('BTCUSDT');
  });

  it('writeTrackedPairs rejects invalid pair symbols', () => {
    writeTrackedPairs(['ETHUSDT', 'BAD!', 'ab', '']);
    const read = readTrackedPairs();
    expect(read).toContain('ETHUSDT');
    expect(read).not.toContain('BAD!');
    expect(read).not.toContain('ab');
  });

  it('readTrackedPairs returns defaults when storage is empty', () => {
    const read = readTrackedPairs();
    expect(read).toEqual([
      'ETHUSDT',
      'BTCUSDT',
      'USUALUSDT',
      'VELODROMEUSDT',
      'BATUSDT',
      'BIOUSDT',
    ]);
  });
});

describe('readTrackedPairs / writeTrackedPairs round-trip', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('write then read returns same data', () => {
    const pairs = ['ETHUSDT', 'BTCUSDT', 'ADAUSDT'];
    writeTrackedPairs(pairs);
    expect(readTrackedPairs()).toEqual(pairs);
  });

  it('writeTrackedPairs normalizes to uppercase', () => {
    writeTrackedPairs(['ethusdt', 'Btcusdt']);
    expect(readTrackedPairs()).toEqual(['ETHUSDT', 'BTCUSDT']);
  });
});

describe('getSavedWallets / writeSavedWallets round-trip', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('write then read returns same data', () => {
    writeSavedWallets([VALID_ADDRESS, VALID_ADDRESS_2]);
    expect(readSavedWallets()).toEqual([VALID_ADDRESS, VALID_ADDRESS_2]);
  });

  it('handles empty wallet list', () => {
    const result = writeSavedWallets([]);
    expect(result).toEqual([]);
    expect(readSavedWallets()).toEqual([]);
  });

  it('clears localStorage key when writing empty list', () => {
    writeSavedWallets([VALID_ADDRESS]);
    writeSavedWallets([]);
    expect(localStorage.getItem(STORAGE_KEYS.savedWallets)).toBeNull();
  });
});

describe('indicator colors persistence', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('readIndicatorColors returns defaults when nothing stored', () => {
    const colors = readIndicatorColors();
    expect(colors.sma).toBeTruthy();
    expect(colors.rsi).toBeTruthy();
    expect(colors.stochK).toBeTruthy();
  });

  it('writeIndicatorColors round-trips valid hex colors', () => {
    const testColors = {
      sma: '#ff0000',
      ema: '#00ff00',
      rsi: '#0000ff',
      stochK: '#ffff00',
      stochD: '#ff00ff',
      bbLine: '#00ffff',
      bbBasis: '#0f0f0f',
      bbFill: '#f0f0f0',
      stochLevelOver: '#ff0000',
      stochLevelUnder: '#00ff00',
    };
    writeIndicatorColors(testColors);
    const read = readIndicatorColors();
    expect(read.sma).toBe('#ff0000');
    expect(read.ema).toBe('#00ff00');
    expect(read.rsi).toBe('#0000ff');
  });

  it('writeIndicatorColors rejects invalid hex values', () => {
    writeIndicatorColors({
      sma: '#zzzzzz',
      ema: '#00ff00',
      rsi: 'invalid',
      stochK: '#ffff00',
      stochD: '#ff00ff',
      bbLine: '#00ffff',
      bbBasis: '#0f0f0f',
      bbFill: '#f0f0f0',
      stochLevelOver: '#ff0000',
      stochLevelUnder: '#00ff00',
    } as any);
    // invalid ones fall back to defaults
    const read = readIndicatorColors();
    expect(read.sma).not.toBe('#zzzzzz');
    expect(read.ema).toBe('#00ff00');
  });

  it('readIndicatorColors returns all keys from DEFAULT_INDICATOR_COLORS', () => {
    const colors = readIndicatorColors();
    const keys: (keyof typeof colors)[] = ['sma', 'ema', 'rsi', 'stochK', 'stochD', 'bbLine', 'bbBasis', 'bbFill', 'stochLevelOver', 'stochLevelUnder'];
    for (const key of keys) {
      expect(colors[key]).toBeTruthy();
    }
  });
});

describe('migrateAppStorage', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('sets storage version after migration', () => {
    migrateAppStorage();
    expect(localStorage.getItem(STORAGE_KEYS.version)).toBeTruthy();
  });

  it('clears trackedPairs and coinsListCache when version mismatches', () => {
    localStorage.setItem(STORAGE_KEYS.trackedPairs, '["OLDPAIR"]');
    localStorage.setItem(STORAGE_KEYS.coinsListCache, '{"old":true}');
    localStorage.setItem(STORAGE_KEYS.version, 'old-version');

    migrateAppStorage();

    expect(localStorage.getItem(STORAGE_KEYS.trackedPairs)).toBeNull();
    expect(localStorage.getItem(STORAGE_KEYS.coinsListCache)).toBeNull();
    expect(localStorage.getItem(STORAGE_KEYS.version)).toBeTruthy();
  });

  it('preserves trackedPairs when version matches', () => {
    localStorage.setItem(STORAGE_KEYS.version, APP_STORAGE_VERSION);
    const pairs = ['ETHUSDT', 'BTCUSDT'];
    writeTrackedPairs(pairs);
    migrateAppStorage();
    expect(readTrackedPairs()).toEqual(pairs);
  });
});

describe('clearAppStorage', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('removes all storage keys and reinitializes', () => {
    writeSavedWallets(['0x1234567890abcdef1234567890abcdef12345678']);
    writeTrackedPairs(['ETHUSDT']);
    writeIndicatorColors({ ...readIndicatorColors(), sma: '#ff0000' });

    clearAppStorage();

    expect(readSavedWallets()).toEqual([]);
    expect(readTrackedPairs()).toEqual([
      'ETHUSDT', 'BTCUSDT', 'USUALUSDT', 'VELODROMEUSDT', 'BATUSDT', 'BIOUSDT',
    ]);
    const colors = readIndicatorColors();
    expect(colors.sma).not.toBe('#ff0000');
  });
});

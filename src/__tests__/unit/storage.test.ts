import { describe, it, expect, beforeEach } from 'vitest';
import {
  readSavedWallets,
  writeSavedWallets,
  readTrackedPairs,
  writeTrackedPairs,
  readIndicatorColors,
  writeIndicatorColors,
  readSmaLines,
  writeSmaLines,
  readEmaLines,
  writeEmaLines,
  migrateAppStorage,
  clearAppStorage,
  STORAGE_KEYS,
} from '@/lib/storage';
import { APP_STORAGE_VERSION } from '@/lib/config';
import type { IndicatorColors, MaLineConfig } from '@/lib/chart/types';

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
    expect(colors.rsi).toBeTruthy();
    expect(colors.stochK).toBeTruthy();
  });

  it('writeIndicatorColors round-trips valid hex colors', () => {
    const testColors = {
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
    expect(read.rsi).toBe('#0000ff');
    expect(read.stochK).toBe('#ffff00');
  });

  it('writeIndicatorColors rejects invalid hex values', () => {
    writeIndicatorColors({
      rsi: 'invalid',
      stochK: '#ffff00',
      stochD: '#ff00ff',
      bbLine: '#00ffff',
      bbBasis: '#0f0f0f',
      bbFill: '#f0f0f0',
      stochLevelOver: '#ff0000',
      stochLevelUnder: '#00ff00',
    } as IndicatorColors);
    const read = readIndicatorColors();
    expect(read.rsi).toBeTruthy(); // falls back to default
    expect(read.stochK).toBe('#ffff00');
  });

  it('readIndicatorColors returns all keys from DEFAULT_INDICATOR_COLORS', () => {
    const colors = readIndicatorColors();
    const keys: (keyof typeof colors)[] = ['rsi', 'stochK', 'stochD', 'bbLine', 'bbBasis', 'bbFill', 'stochLevelOver', 'stochLevelUnder'];
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

describe('SMA/EMA lines persistence', () => {
  beforeEach(() => { localStorage.clear(); });

  it('readSmaLines returns defaults when nothing stored', () => {
    const lines = readSmaLines();
    expect(lines.length).toBeGreaterThanOrEqual(1);
    expect(lines[0].id).toBeDefined();
    expect(lines[0].period).toBeGreaterThan(0);
  });

  it('writeSmaLines / readSmaLines round-trips', () => {
    const testLines: MaLineConfig[] = [
      { id: 'sma-50', period: 50, color: '#00BCD4', enabled: true },
      { id: 'sma-200', period: 200, color: '#4CAF50', enabled: false },
    ];
    writeSmaLines(testLines);
    const read = readSmaLines();
    expect(read).toHaveLength(2);
    expect(read[0].period).toBe(50);
    expect(read[0].enabled).toBe(true);
    expect(read[1].color).toBe('#4CAF50');
  });

  it('readEmaLines returns defaults when nothing stored', () => {
    const lines = readEmaLines();
    expect(lines.length).toBeGreaterThanOrEqual(1);
  });

  it('writeEmaLines / readEmaLines round-trips', () => {
    const testLines: MaLineConfig[] = [
      { id: 'ema-12', period: 12, color: '#2196F3', enabled: true },
    ];
    writeEmaLines(testLines);
    const read = readEmaLines();
    expect(read).toHaveLength(1);
    expect(read[0].period).toBe(12);
  });
});

describe('clearAppStorage', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('removes all storage keys and reinitializes', () => {
    writeSavedWallets(['0x1234567890abcdef1234567890abcdef12345678']);
    writeTrackedPairs(['ETHUSDT']);
    writeIndicatorColors({ ...readIndicatorColors(), rsi: '#ff0000' });
    writeSmaLines([{ id: 'sma-50', period: 50, color: '#00BCD4', enabled: true }]);

    clearAppStorage();

    expect(readSavedWallets()).toEqual([]);
    expect(readTrackedPairs()).toEqual([
      'ETHUSDT', 'BTCUSDT', 'USUALUSDT', 'VELODROMEUSDT', 'BATUSDT', 'BIOUSDT',
    ]);
    const colors = readIndicatorColors();
    expect(colors.rsi).toBeTruthy();
    expect(colors.rsi).not.toBe('#ff0000');
  });
});

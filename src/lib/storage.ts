import { APP_STORAGE_VERSION, DEFAULT_TRACKED_PAIRS, PAIR_SYMBOL_RE, WALLET_ADDRESS_RE } from '@/lib/config';
import { DEFAULT_INDICATOR_COLORS } from '@/lib/chart/indicators';
import type { IndicatorColorKey, IndicatorColors } from '@/lib/chart/types';

export const STORAGE_KEYS = {
  version: 'defiTrackerStorageVersion',
  trackedPairs: 'trackedPairs',
  coinsListCache: 'coinsListCache',
  savedWallets: 'savedWallets',
  chartIndicatorColors: 'chartIndicatorColors',
} as const;

const HEX_COLOR_RE = /^#([0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/;

function sanitizeColor(value: unknown): string | null {
  return typeof value === 'string' && HEX_COLOR_RE.test(value) ? value : null;
}

export function readIndicatorColors(): IndicatorColors {
  const out: IndicatorColors = { ...DEFAULT_INDICATOR_COLORS };
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.chartIndicatorColors);
    if (!raw) return out;
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    if (!parsed || typeof parsed !== 'object') return out;
    (Object.keys(DEFAULT_INDICATOR_COLORS) as IndicatorColorKey[]).forEach((key) => {
      const clean = sanitizeColor(parsed[key]);
      if (clean) out[key] = clean;
    });
    return out;
  } catch {
    return out;
  }
}

export function writeIndicatorColors(colors: IndicatorColors): IndicatorColors {
  const out: IndicatorColors = { ...DEFAULT_INDICATOR_COLORS };
  (Object.keys(DEFAULT_INDICATOR_COLORS) as IndicatorColorKey[]).forEach((key) => {
    const clean = sanitizeColor(colors?.[key]);
    if (clean) out[key] = clean;
  });
  localStorage.setItem(STORAGE_KEYS.chartIndicatorColors, JSON.stringify(out));
  return out;
}

export function readSavedWallets(): string[] {
  try {
    const parsed = JSON.parse(
      localStorage.getItem(STORAGE_KEYS.savedWallets) || '[]'
    );
    if (!Array.isArray(parsed)) return [];
    return [
      ...new Set(
        parsed.filter(
          (wallet: unknown) =>
            typeof wallet === 'string' && WALLET_ADDRESS_RE.test(wallet)
        )
      ),
    ];
  } catch {
    return [];
  }
}

export function writeSavedWallets(wallets: string[]): string[] {
  const cleanWallets = [
    ...new Set(
      (wallets || []).filter(
        (wallet) => typeof wallet === 'string' && WALLET_ADDRESS_RE.test(wallet)
      )
    ),
  ];
  if (cleanWallets.length)
    localStorage.setItem(
      STORAGE_KEYS.savedWallets,
      JSON.stringify(cleanWallets)
    );
  else localStorage.removeItem(STORAGE_KEYS.savedWallets);
  return cleanWallets;
}

function sanitizePairs(pairs: string[]): string[] {
  if (!Array.isArray(pairs)) return [];
  const clean = [
    ...new Set(
      pairs
        .map((p) => (typeof p === 'string' ? p.toUpperCase() : ''))
        .filter((p) => PAIR_SYMBOL_RE.test(p))
    ),
  ];
  return clean.length ? clean : [...DEFAULT_TRACKED_PAIRS];
}

export function readTrackedPairs(): string[] {
  try {
    return sanitizePairs(
      JSON.parse(localStorage.getItem(STORAGE_KEYS.trackedPairs) || '[]')
    );
  } catch {
    return [...DEFAULT_TRACKED_PAIRS];
  }
}

export function writeTrackedPairs(pairs: string[]): void {
  localStorage.setItem(
    STORAGE_KEYS.trackedPairs,
    JSON.stringify(sanitizePairs(pairs))
  );
}

export function migrateAppStorage(): void {
  if (localStorage.getItem(STORAGE_KEYS.version) !== APP_STORAGE_VERSION) {
    localStorage.removeItem(STORAGE_KEYS.trackedPairs);
    localStorage.removeItem(STORAGE_KEYS.coinsListCache);
  }

  writeSavedWallets(readSavedWallets());
  writeIndicatorColors(readIndicatorColors());
  localStorage.setItem(STORAGE_KEYS.version, APP_STORAGE_VERSION);
}

export function clearAppStorage(): void {
  Object.values(STORAGE_KEYS).forEach((key) => localStorage.removeItem(key));
  migrateAppStorage();
}

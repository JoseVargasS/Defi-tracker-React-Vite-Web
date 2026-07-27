import { APP_STORAGE_VERSION, DEFAULT_TRACKED_PAIRS, PAIR_SYMBOL_RE, WALLET_ADDRESS_RE } from '@/lib/config';
import { DEFAULT_INDICATOR_COLORS } from '@/lib/chart/indicators';
import type { IndicatorColorKey, IndicatorColors, MaLineConfig } from '@/lib/chart/types';
import { DEFAULT_SMA_LINES, DEFAULT_EMA_LINES } from '@/store/useMarketStore';

export const STORAGE_KEYS = {
  version: 'defiTrackerStorageVersion',
  trackedPairs: 'trackedPairs',
  coinsListCache: 'coinsListCache',
  savedWallets: 'savedWallets',
  chartIndicatorColors: 'chartIndicatorColors',
  smaLines: 'chartSmaLines',
  emaLines: 'chartEmaLines',
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

function sanitizeMaLines(raw: unknown, defaults: MaLineConfig[]): MaLineConfig[] {
  if (!Array.isArray(raw)) return defaults.map(l => ({ ...l }));
  const hexFallback = '#00BCD4';
  return raw.map((item: unknown) => {
    if (!item || typeof item !== 'object') return null;
    const obj = item as Record<string, unknown>;
    return {
      id: typeof obj.id === 'string' ? obj.id : crypto.randomUUID?.() || `${Date.now()}-${Math.random()}`,
      period: typeof obj.period === 'number' && obj.period > 0 ? obj.period : 50,
      color: sanitizeColor(obj.color) || hexFallback,
      enabled: obj.enabled === true,
    };
  }).filter((l): l is MaLineConfig => l !== null);
}

export function readSmaLines(): MaLineConfig[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.smaLines);
    return sanitizeMaLines(raw ? JSON.parse(raw) : null, DEFAULT_SMA_LINES);
  } catch { return DEFAULT_SMA_LINES.map(l => ({ ...l })); }
}

export function writeSmaLines(lines: MaLineConfig[]): void {
  localStorage.setItem(STORAGE_KEYS.smaLines, JSON.stringify(lines));
}

export function readEmaLines(): MaLineConfig[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.emaLines);
    return sanitizeMaLines(raw ? JSON.parse(raw) : null, DEFAULT_EMA_LINES);
  } catch { return DEFAULT_EMA_LINES.map(l => ({ ...l })); }
}

export function writeEmaLines(lines: MaLineConfig[]): void {
  localStorage.setItem(STORAGE_KEYS.emaLines, JSON.stringify(lines));
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
  const seen = new Set<string>();
  const clean: string[] = [];
  for (const p of pairs) {
    const upper = typeof p === 'string' ? p.toUpperCase() : '';
    if (PAIR_SYMBOL_RE.test(upper) && !seen.has(upper)) {
      seen.add(upper);
      clean.push(upper);
    }
  }
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

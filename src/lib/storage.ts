import { APP_STORAGE_VERSION, DEFAULT_TRACKED_PAIRS, PAIR_SYMBOL_RE, WALLET_ADDRESS_RE, formatTrackedPair, parseTrackedPair } from '@/lib/config';
import { DEFAULT_MONITOR_INTERVALS, DEFAULT_MONITOR_SIGNALS } from '@/lib/alerts';
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
  aiModel: 'aiModel',
  divAlerts: 'divAlerts',
  divMonitor: 'divMonitor',
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

const MA_TIMEFRAME_RE = /^[a-zA-Z0-9]{1,8}$/;

function sanitizeMaLines(raw: unknown, defaults: MaLineConfig[]): MaLineConfig[] {
  if (!Array.isArray(raw)) return defaults.map(l => ({ ...l }));
  const hexFallback = '#00BCD4';
  return raw.map((item: unknown) => {
    if (!item || typeof item !== 'object') return null;
    const obj = item as Record<string, unknown>;
    const kind = obj.kind === 'SMA' || obj.kind === 'EMA' ? obj.kind : undefined;
    const timeframe =
      obj.timeframe === 'chart' || (typeof obj.timeframe === 'string' && MA_TIMEFRAME_RE.test(obj.timeframe))
        ? obj.timeframe
        : undefined;
    const width =
      typeof obj.width === 'number' && obj.width >= 0.5 && obj.width <= 3 ? obj.width : undefined;
    const line: MaLineConfig = {
      id: typeof obj.id === 'string' ? obj.id : crypto.randomUUID?.() || `${Date.now()}-${Math.random()}`,
      period: typeof obj.period === 'number' && obj.period >= 2 && obj.period <= 500 ? Math.round(obj.period) : 50,
      color: sanitizeColor(obj.color) || hexFallback,
      enabled: obj.enabled === true,
      ...(kind ? { kind } : {}),
      ...(timeframe ? { timeframe } : {}),
      ...(width != null ? { width } : {}),
    };
    if (obj.customColor === true) line.customColor = true;
    return line;
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

const MEXC_SYMBOL_RE = /^[A-Z0-9]{2,20}_[A-Z0-9]{2,20}$/;
const TV_SYMBOL_RE = /^[A-Z0-9.]{2,20}$/;

function sanitizePairs(pairs: string[]): string[] {
  if (!Array.isArray(pairs)) return [];
  const seen = new Set<string>();
  const clean: string[] = [];
  for (const p of pairs) {
    if (typeof p !== 'string') continue;
    const { symbol, source } = parseTrackedPair(p);
    const valid =
      source === 'MEXC' ? MEXC_SYMBOL_RE.test(symbol)
      : source === 'TV' ? TV_SYMBOL_RE.test(symbol)
      : PAIR_SYMBOL_RE.test(symbol);
    if (!valid) continue;
    const entry = formatTrackedPair(symbol, source);
    if (!seen.has(entry)) {
      seen.add(entry);
      clean.push(entry);
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

export function readAiModel(): string | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.aiModel);
    return typeof raw === 'string' && raw ? raw : null;
  } catch {
    return null;
  }
}

export function writeAiModel(modelId: string): void {
  try {
    localStorage.setItem(STORAGE_KEYS.aiModel, modelId);
  } catch {
    // almacenamiento lleno o bloqueado: la eleccion solo vive en la sesion
  }
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

export interface DivMonitorPrefs {
  enabled: boolean;
  intervals: string[];
  confluence: boolean;
  signals: string[];
}

export function readDivAlerts(): import('@/lib/alerts').DivAlert[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEYS.divAlerts) || '[]');
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (a): a is import('@/lib/alerts').DivAlert =>
        !!a && typeof a.id === 'string' && typeof a.symbol === 'string',
    );
  } catch {
    return [];
  }
}

export function writeDivAlerts(alerts: import('@/lib/alerts').DivAlert[]): void {
  try {
    localStorage.setItem(STORAGE_KEYS.divAlerts, JSON.stringify(alerts.slice(0, 200)));
  } catch {
    // almacenamiento lleno: las alertas solo viven en la sesion
  }
}

export function readDivMonitor(): DivMonitorPrefs {
  const fallback: DivMonitorPrefs = {
    enabled: true,
    intervals: [...DEFAULT_MONITOR_INTERVALS],
    confluence: true,
    signals: [...DEFAULT_MONITOR_SIGNALS],
  };
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEYS.divMonitor) || 'null') as Partial<DivMonitorPrefs> | null;
    if (!parsed || typeof parsed !== 'object') return fallback;
    return {
      enabled: parsed.enabled !== false,
      intervals: Array.isArray(parsed.intervals) && parsed.intervals.length
        ? parsed.intervals.filter((i): i is string => typeof i === 'string')
        : fallback.intervals,
      confluence: parsed.confluence !== false,
      signals: Array.isArray(parsed.signals)
        ? parsed.signals.filter((i): i is string => typeof i === 'string')
        : fallback.signals,
    };
  } catch {
    return fallback;
  }
}

export function writeDivMonitor(prefs: DivMonitorPrefs): void {
  try {
    localStorage.setItem(STORAGE_KEYS.divMonitor, JSON.stringify(prefs));
  } catch {
    // almacenamiento lleno o bloqueado
  }
}

export function clearAppStorage(): void {
  Object.values(STORAGE_KEYS).forEach((key) => localStorage.removeItem(key));
  migrateAppStorage();
}

import { APP_STORAGE_VERSION, CHART_INTERVAL_KEYS, DEFAULT_TRACKED_PAIRS, PAIR_SYMBOL_RE, WALLET_ADDRESS_RE, formatTrackedPair, parseTrackedPair } from '@/lib/config';
import { DEFAULT_MONITOR_INTERVALS, DEFAULT_MONITOR_SIGNALS } from '@/lib/alerts';
import { DEFAULT_INDICATOR_COLORS } from '@/lib/chart/indicators';
import { isDrawKind } from '@/lib/chart/draw';
import type { DrawTool, IndicatorColorKey, IndicatorColors, MaLineConfig, SmcToggles } from '@/lib/chart/types';
import { DEFAULT_SMA_LINES, DEFAULT_EMA_LINES } from '@/store/useMarketStore';

export const STORAGE_KEYS = {
  version: 'defiTrackerStorageVersion',
  trackedPairs: 'trackedPairs',
  coinsListCache: 'coinsListCache',
  savedWallets: 'savedWallets',
  chartIndicatorColors: 'chartIndicatorColors',
  smaLines: 'chartSmaLines',
  emaLines: 'chartEmaLines',
  chartToggles: 'chartIndicatorToggles',
  currentPair: 'currentPair',
  currentInterval: 'chartInterval',
  chartMode: 'chartMode',
  chartTimezone: 'chartTimezone',
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
  try {
    localStorage.setItem(STORAGE_KEYS.chartIndicatorColors, JSON.stringify(out));
  } catch {
    // almacenamiento lleno o bloqueado
  }
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
  try {
    localStorage.setItem(STORAGE_KEYS.smaLines, JSON.stringify(lines));
  } catch {
    // almacenamiento lleno o bloqueado
  }
}

export function readEmaLines(): MaLineConfig[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.emaLines);
    return sanitizeMaLines(raw ? JSON.parse(raw) : null, DEFAULT_EMA_LINES);
  } catch { return DEFAULT_EMA_LINES.map(l => ({ ...l })); }
}

export function writeEmaLines(lines: MaLineConfig[]): void {
  try {
    localStorage.setItem(STORAGE_KEYS.emaLines, JSON.stringify(lines));
  } catch {
    // almacenamiento lleno o bloqueado
  }
}

export interface ChartTogglesPersisted {
  bollinger: boolean;
  volume: boolean;
  stochRsi: boolean;
  volumeProfile: boolean;
  macd: boolean;
  taker: boolean;
  divs: boolean;
  signals: boolean;
  rsiEnabled: boolean;
  rsiPeriod: number;
  smc: SmcToggles;
  drawTool: DrawTool;
}

export const DEFAULT_CHART_TOGGLES: ChartTogglesPersisted = {
  bollinger: false,
  volume: true,
  stochRsi: false,
  volumeProfile: false,
  macd: false,
  taker: false,
  divs: false,
  signals: true,
  rsiEnabled: true,
  rsiPeriod: 14,
  smc: {
    swings: false,
    structure: false,
    zones: false,
    premium: false,
    eq: false,
    liquidity: false,
    confluence: false,
  },
  drawTool: null,
};

const SMC_KEYS: readonly (keyof SmcToggles)[] = [
  'swings', 'structure', 'zones', 'premium', 'eq', 'liquidity', 'confluence',
];

function sanitizeBool(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

function sanitizeSmc(raw: unknown): SmcToggles {
  const obj = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const out = { ...DEFAULT_CHART_TOGGLES.smc };
  for (const key of SMC_KEYS) out[key] = sanitizeBool(obj[key], out[key]);
  return out;
}

function sanitizeDrawTool(value: unknown): DrawTool {
  if (value === null || value === undefined) return null;
  if (value === 'FIBO' || isDrawKind(value)) return value;
  return null;
}

function sanitizeRsiPeriod(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 2 && value <= 100
    ? Math.round(value)
    : DEFAULT_CHART_TOGGLES.rsiPeriod;
}

export function readChartToggles(): ChartTogglesPersisted {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.chartToggles);
    if (!raw) return { ...DEFAULT_CHART_TOGGLES, smc: { ...DEFAULT_CHART_TOGGLES.smc } };
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    if (!parsed || typeof parsed !== 'object') throw new Error('bad toggles');
    const d = DEFAULT_CHART_TOGGLES;
    return {
      bollinger: sanitizeBool(parsed.bollinger, d.bollinger),
      volume: sanitizeBool(parsed.volume, d.volume),
      stochRsi: sanitizeBool(parsed.stochRsi, d.stochRsi),
      volumeProfile: sanitizeBool(parsed.volumeProfile, d.volumeProfile),
      macd: sanitizeBool(parsed.macd, d.macd),
      taker: sanitizeBool(parsed.taker, d.taker),
      divs: sanitizeBool(parsed.divs, d.divs),
      signals: sanitizeBool(parsed.signals, d.signals),
      rsiEnabled: sanitizeBool(parsed.rsiEnabled, d.rsiEnabled),
      rsiPeriod: sanitizeRsiPeriod(parsed.rsiPeriod),
      smc: sanitizeSmc(parsed.smc),
      drawTool: sanitizeDrawTool(parsed.drawTool),
    };
  } catch {
    return { ...DEFAULT_CHART_TOGGLES, smc: { ...DEFAULT_CHART_TOGGLES.smc } };
  }
}

export function writeChartToggles(toggles: ChartTogglesPersisted): void {
  try {
    const d = DEFAULT_CHART_TOGGLES;
    const out: ChartTogglesPersisted = {
      bollinger: sanitizeBool(toggles?.bollinger, d.bollinger),
      volume: sanitizeBool(toggles?.volume, d.volume),
      stochRsi: sanitizeBool(toggles?.stochRsi, d.stochRsi),
      volumeProfile: sanitizeBool(toggles?.volumeProfile, d.volumeProfile),
      macd: sanitizeBool(toggles?.macd, d.macd),
      taker: sanitizeBool(toggles?.taker, d.taker),
      divs: sanitizeBool(toggles?.divs, d.divs),
      signals: sanitizeBool(toggles?.signals, d.signals),
      rsiEnabled: sanitizeBool(toggles?.rsiEnabled, d.rsiEnabled),
      rsiPeriod: sanitizeRsiPeriod(toggles?.rsiPeriod),
      smc: sanitizeSmc(toggles?.smc),
      drawTool: sanitizeDrawTool(toggles?.drawTool),
    };
    localStorage.setItem(STORAGE_KEYS.chartToggles, JSON.stringify(out));
  } catch {
    // almacenamiento lleno o bloqueado: la config solo vive en la sesion
  }
}

function sanitizeSinglePair(value: unknown): string | null {
  if (typeof value !== 'string' || !value) return null;
  const { symbol, source } = parseTrackedPair(value);
  const valid =
    source === 'MEXC' ? MEXC_SYMBOL_RE.test(symbol)
    : source === 'TV' ? TV_SYMBOL_RE.test(symbol)
    : PAIR_SYMBOL_RE.test(symbol);
  return valid ? formatTrackedPair(symbol, source) : null;
}

export function readCurrentPair(): string | null {
  try {
    return sanitizeSinglePair(localStorage.getItem(STORAGE_KEYS.currentPair));
  } catch {
    return null;
  }
}

export function writeCurrentPair(pair: string | null): void {
  try {
    const clean = sanitizeSinglePair(pair);
    if (clean) localStorage.setItem(STORAGE_KEYS.currentPair, clean);
    else localStorage.removeItem(STORAGE_KEYS.currentPair);
  } catch {
    // almacenamiento lleno o bloqueado
  }
}

export const DEFAULT_CHART_INTERVAL = '5m';

export function readCurrentInterval(): string {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.currentInterval);
    return typeof raw === 'string' && (CHART_INTERVAL_KEYS as readonly string[]).includes(raw)
      ? raw
      : DEFAULT_CHART_INTERVAL;
  } catch {
    return DEFAULT_CHART_INTERVAL;
  }
}

export function writeCurrentInterval(interval: string): void {
  try {
    if (typeof interval === 'string' && (CHART_INTERVAL_KEYS as readonly string[]).includes(interval)) {
      localStorage.setItem(STORAGE_KEYS.currentInterval, interval);
    }
  } catch {
    // almacenamiento lleno o bloqueado
  }
}

export type ChartModePersisted = 'chartjs' | 'tradingview' | 'lightweight';

export const DEFAULT_CHART_MODE: ChartModePersisted = 'lightweight';

function isChartMode(value: unknown): value is ChartModePersisted {
  return value === 'chartjs' || value === 'tradingview' || value === 'lightweight';
}

export function readChartMode(): ChartModePersisted {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.chartMode);
    return isChartMode(raw) ? raw : DEFAULT_CHART_MODE;
  } catch {
    return DEFAULT_CHART_MODE;
  }
}

export function writeChartMode(mode: ChartModePersisted): void {
  try {
    if (isChartMode(mode)) localStorage.setItem(STORAGE_KEYS.chartMode, mode);
  } catch {
    // almacenamiento lleno o bloqueado
  }
}

export const CHART_TIMEZONES: readonly string[] = [
  'America/Lima',
  'UTC',
  'America/New_York',
  'America/Chicago',
  'America/Mexico_City',
  'America/Bogota',
  'America/Santiago',
  'America/Sao_Paulo',
  'Europe/London',
  'Europe/Madrid',
  'Europe/Berlin',
  'Asia/Dubai',
  'Asia/Singapore',
  'Asia/Tokyo',
  'Australia/Sydney',
] as const;

export const DEFAULT_CHART_TIMEZONE = 'America/Lima';

export function readChartTimezone(): string {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.chartTimezone);
    return typeof raw === 'string' && (CHART_TIMEZONES as readonly string[]).includes(raw)
      ? raw
      : DEFAULT_CHART_TIMEZONE;
  } catch {
    return DEFAULT_CHART_TIMEZONE;
  }
}

export function writeChartTimezone(timezone: string): void {
  try {
    if (typeof timezone === 'string' && (CHART_TIMEZONES as readonly string[]).includes(timezone)) {
      localStorage.setItem(STORAGE_KEYS.chartTimezone, timezone);
    }
  } catch {
    // almacenamiento lleno o bloqueado
  }
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
  try {
    localStorage.setItem(
      STORAGE_KEYS.trackedPairs,
      JSON.stringify(sanitizePairs(pairs))
    );
  } catch {
    // almacenamiento lleno o bloqueado
  }
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

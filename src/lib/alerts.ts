import { fetchCandles } from '@/api/market';
import { calculateRsi, toCandleList, type CandleData } from '@/lib/chart/rsi';
import { detectRsiDivergences, isBullishDiv, RSI_DIV_EARLY_LOOKBACK, type RsiDiv } from '@/lib/chart/rsiDiv';

export const SCAN_INTERVAL_MS = 60_000;
export const PAIR_TF_DELAY_MS = 400;
export const MIN_CANDLES = 60;
export const FRESH_CANDLES = 3;
export const PRUNE_MS = 30 * 24 * 60 * 60 * 1000;
export const CONF_COOLDOWN_MS = 24 * 60 * 60 * 1000;
export const SIGNAL_COOLDOWN_MS = 4 * 60 * 60 * 1000;
export const MIN_SIGNAL_CANDLES = 55;
export const MAX_ALERTS = 200;
export const SIGNAL_GROUPS = ['MA_REJECT', 'FVG_TAP', 'SWEEP'] as const;
export const DEFAULT_MONITOR_SIGNALS = [...SIGNAL_GROUPS];

export const DEFAULT_MONITOR_INTERVALS = ['5m', '15m', '30m', '1h'] as const;

export type DivStatus = 'PRE' | 'CONFIRMED';

export interface DivAlert {
  id: string;
  symbol: string;
  source: 'MEXC';
  interval: string;
  kind: string;
  bullish: boolean;
  message: string;
  createdAt: number;
  candleTime: number;
  seen: boolean;
  status: DivStatus;
}

export interface DivCandidate {
  symbol: string;
  interval: string;
  div: RsiDiv;
  candleTime: number;
  pre: boolean;
}

export interface ConfluenceCandidate {
  symbol: string;
  interval: string;
  bullish: boolean;
  candleTime: number;
  intervals: string[];
}

export function divId(symbol: string, interval: string, kind: string, candleTime: number): string {
  return `${symbol}|${interval}|${kind}|${candleTime}`;
}

export function divTag(pre: boolean, bullish: boolean): string {
  return `${pre ? 'Pre-' : ''}${bullish ? 'Bull' : 'Bear'}`;
}

export function divMessage(symbol: string, interval: string, pre: boolean, bullish: boolean): string {
  return `¡${divTag(pre, bullish)} en ${interval} en ${symbol.replace(/_/g, '')}!`;
}

export function kindLabelEs(kind: string): string {
  switch (kind) {
    case 'REG_BULL': return 'Alcista regular';
    case 'HID_BULL': return 'Alcista oculta';
    case 'REG_BEAR': return 'Bajista regular';
    case 'HID_BEAR': return 'Bajista oculta';
    case 'CONF_BULL': return 'Doble confirmación alcista';
    case 'CONF_BEAR': return 'Doble confirmación bajista';
    default: return kind;
  }
}

export function tfDurationMs(interval: string): number {
  switch (interval.trim()) {
    case '1m': return 60_000;
    case '3m': return 180_000;
    case '5m': return 300_000;
    case '15m': return 900_000;
    case '30m': return 1_800_000;
    case '1h': return 3_600_000;
    case '2h': return 7_200_000;
    case '4h': return 14_400_000;
    case '6h': return 21_600_000;
    case '8h': return 28_800_000;
    case '12h': return 43_200_000;
    case '1d': return 86_400_000;
    case '3d': return 259_200_000;
    case '5d': return 432_000_000;
    case '1w': return 604_800_000;
    case '2w': return 1_209_600_000;
    case '1M':
    case '1mo': return 2_592_000_000;
    case '3M': return 7_776_000_000;
    default: return 0;
  }
}

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Escanea un par MEXC en varios TFs: divergencias frescas (pivote <= 3
// velas cerradas) tempranas + confirmadas, secuencial con pausa.
export async function scanPairDivergences(
  symbol: string,
  intervals: string[],
  fetch: (symbol: string, interval: string) => Promise<unknown[][]> = (s, tf) =>
    fetchCandles(`${s}-MEXC`, tf),
): Promise<{
  candidates: DivCandidate[];
  fresh: { interval: string; div: RsiDiv; candleTime: number }[];
  byInterval: Map<string, CandleData[]>;
}> {
  const candidates: DivCandidate[] = [];
  const fresh: { interval: string; div: RsiDiv; candleTime: number }[] = [];
  const byInterval = new Map<string, CandleData[]>();
  for (const interval of intervals) {
    try {
      const rows = await fetch(symbol, interval);
      const candles = toCandleList(rows);
      if (candles.length < MIN_CANDLES) continue;
      byInterval.set(interval, candles);
      const rsi = calculateRsi(candles);
      if (rsi.length !== candles.length) continue;
      const early = detectRsiDivergences(candles, rsi, RSI_DIV_EARLY_LOOKBACK);
      const confirmed = detectRsiDivergences(candles, rsi);
      for (const [divs, pre] of [[early, true], [confirmed, false]] as [RsiDiv[], boolean][]) {
        const last = divs.reduce<RsiDiv | null>(
          (best, d) => (!best || d.idx2 > best.idx2 ? d : best), null,
        );
        if (!last) continue;
        const recency = candles.length - 1 - last.idx2;
        if (recency < 0 || recency > FRESH_CANDLES) continue;
        candidates.push({ symbol, interval, div: last, candleTime: candles[last.idx2]!.time, pre });
      }
      const best = [...early, ...confirmed].reduce<RsiDiv | null>(
        (acc, d) => (!acc || d.idx2 > acc.idx2 ? d : acc), null,
      );
      if (best) {
        const recency = candles.length - 1 - best.idx2;
        if (recency >= 0 && recency <= FRESH_CANDLES) {
          fresh.push({ interval, div: best, candleTime: candles[best.idx2]!.time });
        }
      }
    } catch {
      // ese TF se salta, el scan sigue
    }
    await delay(PAIR_TF_DELAY_MS);
  }
  return { candidates, fresh, byInterval };
}

// Doble confirmacion: misma direccion fresca en 2+ TFs.
export function buildConfluence(
  symbol: string,
  fresh: { interval: string; div: RsiDiv; candleTime: number }[],
): ConfluenceCandidate | null {
  for (const bullish of [true, false]) {
    const sameDir = fresh.filter((f) => isBullishDiv(f.div.kind) === bullish);
    const tfs = [...new Set(sameDir.map((f) => f.interval))];
    if (tfs.length < 2) continue;
    const best = tfs.reduce((a, b) => (tfDurationMs(b) > tfDurationMs(a) ? b : a));
    const candleTime = Math.max(...sameDir.map((f) => f.candleTime));
    return { symbol, interval: best, bullish, candleTime, intervals: tfs.sort((a, b) => tfDurationMs(a) - tfDurationMs(b)) };
  }
  return null;
}

export function confluenceMessage(symbol: string, bullish: boolean, intervals: string[]): string {
  const dir = bullish ? 'alcista' : 'bajista';
  return `¡Doble confirmación ${dir} ${intervals.join('+')} en ${symbol.replace(/_/g, '')}!`;
}

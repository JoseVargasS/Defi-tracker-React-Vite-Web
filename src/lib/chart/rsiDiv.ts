import type { CandleData } from '@/lib/chart/rsi';

export const RSI_DIV_LOOKBACK = 5;
export const RSI_DIV_EARLY_LOOKBACK = 2;
export const RSI_DIV_MIN_SEP = 5;
export const RSI_DIV_MAX_SEP = 60;

export type RsiDivKind = 'REG_BULL' | 'REG_BEAR' | 'HID_BULL' | 'HID_BEAR';

export interface RsiDiv {
  idx1: number;
  idx2: number;
  rsi1: number;
  rsi2: number;
  kind: RsiDivKind;
  early?: boolean;
}

export function isBullishDiv(kind: RsiDivKind): boolean {
  return kind === 'REG_BULL' || kind === 'HID_BULL';
}

// Fractal N por lado sobre la serie del RSI.
function fractalPivots(values: number[], lookback: number, findHigh: boolean): number[] {
  if (values.length < lookback * 2 + 1) return [];
  const out: number[] = [];
  for (let i = lookback; i < values.length - lookback; i++) {
    const v = values[i]!;
    let ok = true;
    for (let j = i - lookback; j <= i + lookback; j++) {
      if (j === i) continue;
      if (findHigh && values[j]! > v) {
        ok = false;
        break;
      }
      if (!findHigh && values[j]! < v) {
        ok = false;
        break;
      }
    }
    if (ok) out.push(i);
  }
  return out;
}

export function detectRsiDivergences(
  candles: CandleData[],
  rsi: number[],
  lookback: number = RSI_DIV_LOOKBACK,
): RsiDiv[] {
  if (candles.length === 0 || rsi.length !== candles.length) return [];
  const lows = candles.map((c) => c.low);
  const highs = candles.map((c) => c.high);
  // Ignora el relleno de ceros del inicio del RSI.
  const firstValid = rsi.findIndex((v) => v > 0);
  if (firstValid < 0) return [];
  const out: RsiDiv[] = [];

  function scan(pivRsi: number[], isLow: boolean): void {
    let p = 0;
    while (p + 1 < pivRsi.length) {
      const a = pivRsi[p]!;
      const b = pivRsi[p + 1]!;
      p++;
      if (a < firstValid) continue;
      const sep = b - a;
      if (sep < RSI_DIV_MIN_SEP || sep > RSI_DIV_MAX_SEP) continue;
      const priceA = isLow ? lows[a]! : highs[a]!;
      const priceB = isLow ? lows[b]! : highs[b]!;
      const rsiA = rsi[a]!;
      const rsiB = rsi[b]!;
      if (rsiA <= 0 || rsiB <= 0) continue;
      if (isLow) {
        if (priceB < priceA && rsiB > rsiA) out.push({ idx1: a, idx2: b, rsi1: rsiA, rsi2: rsiB, kind: 'REG_BULL' });
        else if (priceB > priceA && rsiB < rsiA) out.push({ idx1: a, idx2: b, rsi1: rsiA, rsi2: rsiB, kind: 'HID_BULL' });
      } else {
        if (priceB > priceA && rsiB < rsiA) out.push({ idx1: a, idx2: b, rsi1: rsiA, rsi2: rsiB, kind: 'REG_BEAR' });
        else if (priceB < priceA && rsiB > rsiA) out.push({ idx1: a, idx2: b, rsi1: rsiA, rsi2: rsiB, kind: 'HID_BEAR' });
      }
    }
  }

  scan(fractalPivots(rsi, lookback, false), true);
  scan(fractalPivots(rsi, lookback, true), false);
  return out.sort((x, y) => x.idx2 - y.idx2);
}

// Tempranas marcadas y sin las que ya salieron confirmadas (±2 velas).
export function mergeConfirmedAndEarly(confirmed: RsiDiv[], early: RsiDiv[]): RsiDiv[] {
  const fresh = early
    .map((d) => ({ ...d, early: true }));
  const filtered = fresh.filter(
    (e) => !confirmed.some((c) => c.kind === e.kind && Math.abs(c.idx2 - e.idx2) <= 2),
  );
  return [...confirmed, ...filtered].sort((x, y) => x.idx2 - y.idx2);
}

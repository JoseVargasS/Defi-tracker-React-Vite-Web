import type { CandleData } from '@/lib/chart/rsi';

export type IndexedPoint = [index: number, value: number];

export interface MacdData {
  dif: IndexedPoint[];
  dea: IndexedPoint[];
  hist: IndexedPoint[];
}

// MACD(12, 26, 9) clasico: DIF = EMA12 - EMA26, DEA = EMA9(DIF),
// histograma = 2 * (DIF - DEA). Indices alineados a vela.
export function calculateMacd(
  candles: CandleData[],
  fast = 12,
  slow = 26,
  signal = 9,
): MacdData {
  const empty: MacdData = { dif: [], dea: [], hist: [] };
  if (candles.length < slow + signal - 1) return empty;
  const closes = candles.map((c) => c.close);
  const fastEma = emaSeries(closes, fast);
  const slowEma = emaSeries(closes, slow);
  const difRaw: number[] = new Array(closes.length).fill(NaN);
  for (let i = slow - 1; i < closes.length; i++) {
    difRaw[i] = fastEma[i]! - slowEma[i]!;
  }
  const firstDea = slow + signal - 2;
  let seed = 0;
  for (let i = slow - 1; i <= firstDea; i++) seed += difRaw[i]!;
  let dea = seed / signal;
  const deaRaw: number[] = new Array(closes.length).fill(NaN);
  deaRaw[firstDea] = dea;
  const k = 2 / (signal + 1);
  for (let i = firstDea + 1; i < closes.length; i++) {
    dea = difRaw[i]! * k + dea * (1 - k);
    deaRaw[i] = dea;
  }
  const dif: IndexedPoint[] = [];
  const deaOut: IndexedPoint[] = [];
  const hist: IndexedPoint[] = [];
  for (let i = firstDea; i < closes.length; i++) {
    const d = difRaw[i]!;
    const s = deaRaw[i]!;
    dif.push([i, d]);
    deaOut.push([i, s]);
    hist.push([i, 2 * (d - s)]);
  }
  return { dif, dea: deaOut, hist };
}

// EMA alineada por indice (NaN antes del warm-up), semilla SMA.
function emaSeries(values: number[], period: number): number[] {
  const out: number[] = new Array(values.length).fill(NaN);
  if (values.length < period) return out;
  const k = 2 / (period + 1);
  let ema = values.slice(0, period).reduce((a, v) => a + v, 0) / period;
  out[period - 1] = ema;
  for (let i = period; i < values.length; i++) {
    ema = values[i]! * k + ema * (1 - k);
    out[i] = ema;
  }
  return out;
}

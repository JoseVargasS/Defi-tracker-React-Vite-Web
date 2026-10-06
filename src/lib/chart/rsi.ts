export interface CandleData {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  takerBuyVol?: number;
}

function toNum(value: unknown): number {
  if (typeof value === 'number') return value;
  if (typeof value === 'string') return Number(value) || 0;
  return Number(String(value ?? 0)) || 0;
}

// Media del RSI para la signal line del subpanel (SMA 14, la estandar de TV).
export const RSI_MA_PERIOD = 14;

export function rsiMaOf(values: number[], period: number = RSI_MA_PERIOD): number[] {
  if (values.length < period) return [...values];
  const out: number[] = new Array(values.length);
  let sum = 0;
  for (let i = 0; i < values.length; i++) {
    sum += values[i]!;
    if (i >= period) sum -= values[i - period]!;
    out[i] = i >= period - 1 ? sum / period : values[i]!;
  }
  return out;
}

export function calculateRsi(candles: CandleData[], period = 14): number[] {
  if (candles.length <= period) return [];
  let avgGain = 0;
  let avgLoss = 0;
  for (let i = 1; i <= period; i++) {
    const diff = candles[i]!.close - candles[i - 1]!.close;
    if (diff >= 0) avgGain += diff;
    else avgLoss -= diff;
  }
  avgGain /= period;
  avgLoss /= period;
  const rsi: number[] = [
    avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss),
  ];
  for (let i = period + 1; i < candles.length; i++) {
    const diff = candles[i]!.close - candles[i - 1]!.close;
    const gain = diff >= 0 ? diff : 0;
    const loss = diff < 0 ? -diff : 0;
    avgGain = (avgGain * (period - 1) + gain) / period;
    avgLoss = (avgLoss * (period - 1) + loss) / period;
    rsi.push(avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss));
  }
  return [...new Array<number>(period).fill(0), ...rsi];
}

export function toCandleList(rows: unknown[][]): CandleData[] {
  const out: CandleData[] = [];
  for (const row of rows) {
    const time = toNum(row?.[0]);
    if (time > 0) {
      out.push({
        time,
        open: toNum(row?.[1]),
        high: toNum(row?.[2]),
        low: toNum(row?.[3]),
        close: toNum(row?.[4]),
        volume: toNum(row?.[5]),
        takerBuyVol: toNum(row?.[9]),
      });
    }
  }
  return out;
}

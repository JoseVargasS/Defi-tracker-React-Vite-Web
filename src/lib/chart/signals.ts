import type { CandleData } from '@/lib/chart/rsi';
import { detectFvg, detectSwings } from '@/lib/chart/smc';

export interface TradeSignal {
  kind: string;
  bullish: boolean;
  label: string;
}

function smaSeries(values: number[], period: number): number[] {
  const out: number[] = new Array(values.length);
  let sum = 0;
  for (let i = 0; i < values.length; i++) {
    sum += values[i]!;
    if (i >= period) sum -= values[i - period]!;
    out[i] = i >= period - 1 ? sum / period : NaN;
  }
  return out;
}

function emaSeries(values: number[], period: number): number[] {
  const out: number[] = new Array(values.length).fill(NaN);
  if (values.length < period) return out;
  const k = 2 / (period + 1);
  let ema = values.slice(0, period).reduce((a, v) => a + v, 0) / period;
  for (let i = 0; i < values.length; i++) {
    if (i < period - 1) out[i] = NaN;
    else if (i === period - 1) out[i] = ema;
    else {
      ema = values[i]! * k + ema * (1 - k);
      out[i] = ema;
    }
  }
  return out;
}

// Mechazo en media: mecha >=40% del rango perfora SMA/EMA y cierra de vuelta, ultima cerrada.
export function detectMaWickRejection(candles: CandleData[]): TradeSignal | null {
  if (candles.length < 52) return null;
  const idx = candles.length - 2;
  const c = candles[idx]!;
  const range = c.high - c.low;
  if (range <= 0) return null;
  const closes = candles.map((x) => x.close);
  const checks: { period: number; useSma: boolean; label: string }[] = [
    { period: 50, useSma: false, label: 'EMA50' },
    { period: 50, useSma: true, label: 'SMA50' },
    { period: 21, useSma: false, label: 'EMA21' },
    { period: 21, useSma: true, label: 'SMA21' },
  ];
  for (const { period, useSma, label } of checks) {
    const series = useSma ? smaSeries(closes, period) : emaSeries(closes, period);
    const ma = series[idx];
    if (ma == null || !Number.isFinite(ma)) continue;
    const lowerWick = Math.min(c.open, c.close) - c.low;
    const upperWick = c.high - Math.max(c.open, c.close);
    if (c.low < ma && c.close > ma && lowerWick >= range * 0.4) {
      return { kind: 'MA_REJECT_BULL', bullish: true, label };
    }
    if (c.high > ma && c.close < ma && upperWick >= range * 0.4) {
      return { kind: 'MA_REJECT_BEAR', bullish: false, label };
    }
  }
  return null;
}

// Toque en FVG sin mitigar + cierre de rechazo, ultima cerrada.
export function detectFvgTap(candles: CandleData[]): TradeSignal | null {
  if (candles.length < 10) return null;
  const idx = candles.length - 2;
  const c = candles[idx]!;
  const zones = detectFvg(candles).filter((z) => !z.mitigated && z.startIdx < idx);
  for (const z of zones) {
    if (z.bullish && c.low <= z.top && c.low >= z.bottom && c.close > z.top) {
      return { kind: 'FVG_TAP_BULL', bullish: true, label: 'FVG' };
    }
    if (!z.bullish && c.high >= z.bottom && c.high <= z.top && c.close < z.bottom) {
      return { kind: 'FVG_TAP_BEAR', bullish: false, label: 'FVG' };
    }
  }
  return null;
}

// Barrido de maximo/minimo previo + cierre de vuelta adentro (SFP), ultima cerrada.
export function detectSweepReclaim(candles: CandleData[]): TradeSignal | null {
  if (candles.length < 12) return null;
  const idx = candles.length - 2;
  const c = candles[idx]!;
  const swings = detectSwings(candles, 3);
  const lastHigh = swings.filter((s) => s.isHigh && s.idx < idx).reduce<null | typeof swings[number]>(
    (best, s) => (!best || s.idx > best.idx ? s : best), null,
  );
  const lastLow = swings.filter((s) => !s.isHigh && s.idx < idx).reduce<null | typeof swings[number]>(
    (best, s) => (!best || s.idx > best.idx ? s : best), null,
  );
  if (lastHigh != null && c.high > lastHigh.price && c.close < lastHigh.price) {
    return { kind: 'SWEEP_BEAR', bullish: false, label: 'Barrido' };
  }
  if (lastLow != null && c.low < lastLow.price && c.close > lastLow.price) {
    return { kind: 'SWEEP_BULL', bullish: true, label: 'Barrido' };
  }
  return null;
}

export function detectSignals(candles: CandleData[]): TradeSignal[] {
  return [detectMaWickRejection(candles), detectFvgTap(candles), detectSweepReclaim(candles)].filter(
    (s): s is TradeSignal => s != null,
  );
}

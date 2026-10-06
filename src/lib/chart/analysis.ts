import type { CandleData } from '@/lib/chart/rsi';
import { calculateRsi } from '@/lib/chart/rsi';
import { detectRsiDivergences, RSI_DIV_EARLY_LOOKBACK, type RsiDiv } from '@/lib/chart/rsiDiv';
import { computeSmc, detectSwings } from '@/lib/chart/smc';
import { detectSweepReclaim } from '@/lib/chart/signals';

export type PulseBias = 'BULLISH' | 'BEARISH' | 'NEUTRAL';

export interface PulseItem {
  id: string;
  label: string;
  bullish: boolean | null;
  hit: boolean;
  detail?: string;
}

export interface PulseAnalysis {
  bias: PulseBias;
  score: number;
  contraTrend: boolean;
  items: PulseItem[];
  support: number | null;
  resistance: number | null;
  headline: string;
}

export interface SrZone {
  top: number;
  bottom: number;
  touches: number;
  isSupport: boolean;
}

export const PULSE_MA_PERIODS = [21, 50, 200];
export const PULSE_MA_TFS = ['15m', '1h', '4h'];

function pulseAtr(candles: CandleData[], period = 14): number {
  if (candles.length < 2) return 0;
  let sum = 0;
  let n = 0;
  for (let i = Math.max(1, candles.length - period); i < candles.length; i++) {
    const prev = candles[i - 1]!.close;
    sum += Math.max(candles[i]!.high - candles[i]!.low, Math.abs(candles[i]!.high - prev), Math.abs(candles[i]!.low - prev));
    n++;
  }
  return n > 0 ? sum / n : 0;
}

// Zonas horizontales por cluster de swings con tolerancia ATR, minimo 3 toques.
export function detectSrZones(candles: CandleData[], lookback = 150, minTouches = 3): SrZone[] {
  if (candles.length < 30) return [];
  const sample = candles.slice(-Math.min(lookback, candles.length));
  const atr = pulseAtr(candles);
  if (atr <= 0) return [];
  const tol = atr * 0.3;
  const swings = detectSwings(sample, 5);
  const cluster = (prices: number[], isSupport: boolean): SrZone[] => {
    if (!prices.length) return [];
    const sorted = [...prices].sort((a, b) => a - b);
    const out: SrZone[] = [];
    let group: number[] = [sorted[0]!];
    for (let i = 1; i < sorted.length; i++) {
      if (sorted[i]! - group[group.length - 1]! <= tol) group.push(sorted[i]!);
      else {
        if (group.length >= minTouches) {
          out.push({ top: Math.max(...group), bottom: Math.min(...group), touches: group.length, isSupport });
        }
        group = [sorted[i]!];
      }
    }
    if (group.length >= minTouches) {
      out.push({ top: Math.max(...group), bottom: Math.min(...group), touches: group.length, isSupport });
    }
    return out;
  };
  return [
    ...cluster(swings.filter((s) => !s.isHigh).map((s) => s.price), true),
    ...cluster(swings.filter((s) => s.isHigh).map((s) => s.price), false),
  ];
}

export function fmtPulsePrice(v: number): string {
  if (!Number.isFinite(v)) return '--';
  let s: string;
  if (v >= 1000) s = v.toLocaleString('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  else if (v >= 1) s = v.toFixed(4);
  else s = v.toFixed(6);
  return s.includes('.') ? s.replace(/0+$/, '').replace(/\.$/, '') : s;
}

function smaLast(values: number[], period: number): number | null {
  if (values.length < period) return null;
  return values.slice(-period).reduce((a, v) => a + v, 0) / period;
}

function emaLast(values: number[], period: number): number | null {
  if (values.length < period) return null;
  const k = 2 / (period + 1);
  let ema = values.slice(-period).reduce((a, v) => a + v, 0) / period;
  for (let i = values.length - period + 1; i < values.length; i++) {
    ema = values[i]! * k + ema * (1 - k);
  }
  return ema;
}

export interface MaMatrix {
  bullVotes: number;
  bearVotes: number;
  perTf: string[];
}

// Matriz 21/50/200 x TFs: cada par (periodo, TF) vota si el precio esta sobre ambas o bajo ambas.
export function maMatrixScore(
  closesByTf: Map<string, number[]>,
  chartTf: string,
  chartCloses: number[],
  close: number,
): MaMatrix {
  let bull = 0;
  let bear = 0;
  const perTf: string[] = [];
  for (const tf of PULSE_MA_TFS) {
    const values = tf === chartTf ? chartCloses : (closesByTf.get(tf) ?? []);
    let tfBull = 0;
    let tfBear = 0;
    for (const period of PULSE_MA_PERIODS) {
      const sma = smaLast(values, period);
      const ema = emaLast(values, period);
      if (sma == null || ema == null) continue;
      if (close > sma && close > ema) tfBull++;
      else if (close < sma && close < ema) tfBear++;
    }
    bull += tfBull;
    bear += tfBear;
    const arrow = tfBull > tfBear ? '▲' : tfBear > tfBull ? '▼' : '·';
    perTf.push(`${tf} ${tfBull}/3 ${arrow}`);
  }
  return { bullVotes: bull, bearVotes: bear, perTf };
}

// Analisis completo sobre las velas del chart + cierres por TF (pueden venir vacios).
export function analyzePulse(
  candles: CandleData[],
  interval: string,
  closesByTf: Map<string, number[]>,
): PulseAnalysis | null {
  if (candles.length < 60) return null;
  const idx = candles.length - 2;
  const c = candles[idx]!;
  const close = candles[candles.length - 1]?.close ?? c.close;
  const range = c.high - c.low;
  if (!(range > 0)) return null;
  const body = Math.abs(c.close - c.open) / range;
  const atr = pulseAtr(candles);
  if (!(atr > 0)) return null;

  const zones = detectSrZones(candles);
  const sup = zones.filter((z) => z.isSupport && z.bottom <= close).reduce<null | SrZone>(
    (best, z) => (!best || z.top > best.top ? z : best), null,
  );
  const res = zones.filter((z) => !z.isSupport && z.top >= close).reduce<null | SrZone>(
    (best, z) => (!best || z.bottom < best.bottom ? z : best), null,
  );
  let bounceDir: boolean | null = null;
  if (sup && c.low <= sup.top && c.low >= sup.bottom - atr * 0.25 && c.close > sup.top && body >= 0.3) {
    bounceDir = true;
  }
  if (res && c.high >= res.bottom && c.high <= res.top + atr * 0.25 && c.close < res.bottom && body >= 0.3) {
    bounceDir = false;
  }

  const chartCloses = candles.map((x) => x.close);
  const matrix = maMatrixScore(closesByTf, interval, chartCloses, close);
  const maBull = matrix.bullVotes - matrix.bearVotes >= 3;
  const maBear = matrix.bearVotes - matrix.bullVotes >= 3;
  const maTotal = matrix.bullVotes + matrix.bearVotes;
  const maLabel = maTotal === 0
    ? 'Medias (sin dato 15m/1h/4h)'
    : maBull
      ? `Medias ${matrix.bullVotes}/9 alcistas`
      : maBear
        ? `Medias ${matrix.bearVotes}/9 bajistas`
        : `Medias mixtas ${matrix.bullVotes}-${matrix.bearVotes}`;

  const rsi = calculateRsi(candles);
  let divDir: boolean | null = null;
  if (rsi.length === candles.length) {
    const fresh = [...detectRsiDivergences(candles, rsi, RSI_DIV_EARLY_LOOKBACK), ...detectRsiDivergences(candles, rsi)]
      .filter((d) => candles.length - 1 - d.idx2 >= 0 && candles.length - 1 - d.idx2 <= 3)
      .reduce<null | RsiDiv>((best, d) => (!best || d.idx2 > best.idx2 ? d : best), null);
    divDir = fresh ? fresh.kind === 'REG_BULL' || fresh.kind === 'HID_BULL' : null;
  }

  let sweepDir: boolean | null = null;
  try {
    sweepDir = detectSweepReclaim(candles)?.bullish ?? null;
  } catch {
    sweepDir = null;
  }

  let structDir: boolean | null = null;
  try {
    const events = computeSmc(candles, interval).events;
    structDir = events.reduce<null | (typeof events)[number]>(
      (best, e) => (!best || e.breakIdx > best.breakIdx ? e : best), null,
    )?.bullish ?? null;
  } catch {
    structDir = null;
  }

  const bullVotes = [bounceDir === true, maBull, divDir === true, sweepDir === true, structDir === true].filter(Boolean).length;
  const bearVotes = [bounceDir === false, maBear, divDir === false, sweepDir === false, structDir === false].filter(Boolean).length;
  const bias: PulseBias = bullVotes > bearVotes ? 'BULLISH' : bearVotes > bullVotes ? 'BEARISH' : 'NEUTRAL';
  const contraTrend = bounceDir != null && structDir != null && bounceDir !== structDir;

  const dirLabel = (b: boolean | null) => (b == null ? null : b ? 'alcista' : 'bajista');
  const items: PulseItem[] = [
    {
      id: 'zona',
      label: bounceDir != null
        ? `Rebote ${dirLabel(bounceDir)} en zona (${sup?.touches ?? res?.touches ?? 0} toques)`
        : 'Sin rebote en zona ahora',
      bullish: bounceDir,
      hit: bounceDir != null,
    },
    {
      id: 'ma200',
      label: maLabel,
      bullish: maBull ? true : maBear ? false : null,
      hit: maBull || maBear,
      detail: matrix.perTf.join(' · '),
    },
    {
      id: 'div',
      label: divDir != null ? `Div ${dirLabel(divDir)} fresca en RSI` : 'Sin div fresca',
      bullish: divDir,
      hit: divDir != null,
    },
    {
      id: 'sweep',
      label: sweepDir != null ? `Barrido + reclaim ${dirLabel(sweepDir)}` : 'Sin barrido reciente',
      bullish: sweepDir,
      hit: sweepDir != null,
    },
    {
      id: 'struct',
      label: structDir != null ? `Estructura ${dirLabel(structDir)}` : 'Estructura mixta',
      bullish: structDir,
      hit: structDir != null,
    },
  ];

  const ct = contraTrend ? ' (contratendencia)' : '';
  const headline = bias === 'BULLISH'
    ? sup
      ? `Sesgo alcista · esperar reacción en ${fmtPulsePrice(sup.bottom)}–${fmtPulsePrice(sup.top)}${ct}`
      : `Sesgo alcista · sin zona cercana, no perseguir${ct}`
    : bias === 'BEARISH'
      ? res
        ? `Sesgo bajista · techo en ${fmtPulsePrice(res.bottom)}–${fmtPulsePrice(res.top)}${ct}`
        : `Sesgo bajista · sin techo cercano, no perseguir${ct}`
      : 'Sin ventaja clara · esperar cierre fuera de rango';

  return {
    bias,
    score: Math.max(bullVotes, bearVotes),
    contraTrend,
    items,
    support: sup?.top ?? null,
    resistance: res?.bottom ?? null,
    headline,
  };
}

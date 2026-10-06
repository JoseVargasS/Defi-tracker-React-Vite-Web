import type { CandleData } from '@/lib/chart/rsi';

export type MaType = 'SMA' | 'EMA';

export interface MaConfig {
  id: string;
  type: MaType;
  period: number;
  color: string;
  width: number;
  visible: boolean;
  timeframe: string;
}

export interface TimedValue {
  time: number;
  value: number;
}

// HTF (otro TF): blanco hueso salvo color personalizado en el modal.
export function resolveHtfColor(line: { color?: string; customColor?: boolean }): string {
  if (line.customColor && typeof line.color === 'string' && line.color) return line.color;
  return '#f0eeeb';
}

// Anti-encimado de tags: centros ordenados por y con alto+aire minimo,
// acotados a [minC, maxC]; si se pasa abajo, recorre todo hacia arriba.
export function stackTagCenters(
  centers: number[],
  height: number,
  gap: number,
  minC: number,
  maxC: number,
): number[] {
  const lo = minC - height / 2;
  const order = centers.map((_, i) => i).sort((a, b) => centers[a]! - centers[b]!);
  const tops = new Array<number>(centers.length);
  let prevBottom = -Infinity;
  for (const idx of order) {
    const top = Math.max(centers[idx]! - height / 2, prevBottom + gap, lo);
    tops[idx] = top;
    prevBottom = top + height;
  }
  const overflow = prevBottom - maxC;
  if (overflow > 0) {
    for (let i = 0; i < tops.length; i++) tops[i]! -= overflow;
    const under = lo - Math.min(...tops);
    if (under > 0) {
      for (let i = 0; i < tops.length; i++) tops[i]! += under;
    }
  }
  return tops.map((t) => t + height / 2);
}

export function smaOf(closes: number[], period: number): { index: number; value: number }[] {
  const line: { index: number; value: number }[] = [];
  let sum = 0;
  for (let i = 0; i < closes.length; i++) {
    sum += closes[i]!;
    if (i >= period) sum -= closes[i - period]!;
    if (i >= period - 1) line.push({ index: i, value: sum / period });
  }
  return line;
}

export function emaOf(closes: number[], period: number): { index: number; value: number }[] {
  const line: { index: number; value: number }[] = [];
  if (closes.length < period) return line;
  const k = 2 / (period + 1);
  let ema = closes.slice(0, period).reduce((a, v) => a + v, 0) / period;
  line.push({ index: period - 1, value: ema });
  for (let i = period; i < closes.length; i++) {
    ema = closes[i]! * k + ema * (1 - k);
    line.push({ index: i, value: ema });
  }
  return line;
}

// MA calculada en velas de otro TF, mapeada a tiempos del chart.
export function alignExtraMa(
  chart: CandleData[],
  ma: MaConfig,
  extra: CandleData[],
): TimedValue[] | null {
  if (chart.length === 0 || extra.length < ma.period) return null;
  const extraCloses = extra.map((c) => c.close);
  const extraMa = ma.type === 'EMA' ? emaOf(extraCloses, ma.period) : smaOf(extraCloses, ma.period);
  if (extraMa.length === 0) return null;
  const times = extra.map((c) => c.time);
  const offset = extra.length - extraMa.length;
  const out: TimedValue[] = [];
  let j = 0;
  let last: number | null = null;
  for (let i = 0; i < chart.length; i++) {
    const t = chart[i]!.time;
    while (j < extraMa.length && times[j + offset]! <= t) {
      last = extraMa[j]!.value;
      j++;
    }
    if (last != null) out.push({ time: t, value: last });
  }
  return out.length ? out : null;
}

// MAs locales (chart) + alineadas de otro TF. Duplicadas (mismo tipo,
// periodo y TF efectivo) se pintan solo una; gana la de TF "chart".
export function computeMaLines(
  chart: CandleData[],
  interval: string,
  mas: MaConfig[],
  extras: Map<string, CandleData[]>,
): Record<string, TimedValue[]> {
  const out: Record<string, TimedValue[]> = {};
  if (chart.length === 0) return out;
  const seen = new Set<string>();
  const ordered = [...mas].sort((a, b) => (a.timeframe === 'chart' ? 0 : 1) - (b.timeframe === 'chart' ? 0 : 1));
  for (const ma of ordered) {
    if (ma.period < 2 || ma.period > 500) continue;
    const effectiveTf = ma.timeframe === 'chart' || ma.timeframe === interval ? interval : ma.timeframe;
    if (ma.visible) {
      const key = `${ma.type}|${ma.period}|${effectiveTf}`;
      if (seen.has(key)) continue;
      seen.add(key);
    }
    if (ma.timeframe !== 'chart' && ma.timeframe !== interval) {
      const extra = extras.get(ma.timeframe);
      if (!extra) continue;
      const aligned = alignExtraMa(chart, ma, extra);
      if (aligned) out[ma.id] = aligned;
      continue;
    }
    if (chart.length < ma.period) continue;
    const closes = chart.map((c) => c.close);
    const line = ma.type === 'EMA' ? emaOf(closes, ma.period) : smaOf(closes, ma.period);
    out[ma.id] = line.map(({ index, value }) => ({ time: chart[index]!.time, value }));
  }
  return out;
}

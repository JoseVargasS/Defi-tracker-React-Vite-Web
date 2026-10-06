import type { CandleData } from '@/lib/chart/rsi';

export const SMC_SWING_LOOKBACK = 5;
export const SMC_OB_LOOKBACK = 10;
export const SMC_MAX_ZONES_PER_SIDE = 5;
export const SMC_PREMIUM_LOOKBACK = 120;
export const SMC_LIQ_SWINGS_PER_SIDE = 3;

export interface SmcSwing {
  idx: number;
  price: number;
  isHigh: boolean;
}

export type SmcEventKind = 'BOS' | 'CHOCH';

export interface SmcEvent {
  breakIdx: number;
  swingIdx: number;
  levelPrice: number;
  kind: SmcEventKind;
  bullish: boolean;
}

export type SmcZoneKind = 'ORDER_BLOCK' | 'FVG';

export interface SmcZone {
  startIdx: number;
  endIdx: number;
  top: number;
  bottom: number;
  bullish: boolean;
  kind: SmcZoneKind;
  mitigated: boolean;
}

export interface SmcEqLevel {
  price: number;
  idx1: number;
  idx2: number;
  isHigh: boolean;
}

export interface SmcPremiumRange {
  high: number;
  low: number;
  equilibrium: number;
}

export interface SmcConfluenceBand {
  top: number;
  bottom: number;
  startIdx: number;
  endIdx: number;
  tfLabel: string;
}

export interface SmcLiqLevel {
  price: number;
  idx: number;
  isBuySide: boolean;
  swept: boolean;
  sweepIdx: number | null;
}

export interface SmcData {
  swings: SmcSwing[];
  events: SmcEvent[];
  zones: SmcZone[];
  eqLevels: SmcEqLevel[];
  premium: SmcPremiumRange | null;
  confluence: SmcConfluenceBand[];
  liquidity: SmcLiqLevel[];
}

// Fractal N por lado, confirma con lag como en LuxAlgo.
export function detectSwings(candles: CandleData[], lookback: number = SMC_SWING_LOOKBACK): SmcSwing[] {
  if (candles.length < lookback * 2 + 1) return [];
  const out: SmcSwing[] = [];
  for (let i = lookback; i < candles.length - lookback; i++) {
    const h = candles[i]!.high;
    let isHigh = true;
    for (let j = i - lookback; j <= i + lookback; j++) {
      if (j !== i && candles[j]!.high > h) {
        isHigh = false;
        break;
      }
    }
    if (isHigh) out.push({ idx: i, price: h, isHigh: true });
    const l = candles[i]!.low;
    let isLow = true;
    for (let j = i - lookback; j <= i + lookback; j++) {
      if (j !== i && candles[j]!.low < l) {
        isLow = false;
        break;
      }
    }
    if (isLow) out.push({ idx: i, price: l, isHigh: false });
  }
  return out;
}

function atr(candles: CandleData[], period = 14): number {
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

// Rompe a favor = BOS, en contra = CHoCH con flip de sesgo.
export function detectStructure(candles: CandleData[], swings: SmcSwing[]): SmcEvent[] {
  if (!candles.length || !swings.length) return [];
  const events: SmcEvent[] = [];
  let trend = 0;
  let refHigh: SmcSwing | null = null;
  let refLow: SmcSwing | null = null;
  let s = 0;
  while (s < swings.length && (refHigh == null || refLow == null)) {
    const sw = swings[s]!;
    if (sw.isHigh && refHigh == null) refHigh = sw;
    if (!sw.isHigh && refLow == null) refLow = sw;
    s++;
  }
  if (refHigh == null || refLow == null) return events;
  let i = Math.max(refHigh.idx, refLow.idx) + 1;
  while (i < candles.length) {
    const close = candles[i]!.close;
    while (s < swings.length && swings[s]!.idx <= i) {
      const sw = swings[s]!;
      if (sw.isHigh && sw.idx > (refHigh?.idx ?? -1)) refHigh = sw;
      if (!sw.isHigh && sw.idx > (refLow?.idx ?? -1)) refLow = sw;
      s++;
    }
    const rh = refHigh;
    const rl = refLow;
    if (rh != null && close > rh.price) {
      events.push({ breakIdx: i, swingIdx: rh.idx, levelPrice: rh.price, kind: trend === 1 ? 'BOS' : 'CHOCH', bullish: true });
      trend = 1;
      refHigh = { idx: i, price: candles[i]!.high, isHigh: true };
      i++;
      continue;
    }
    if (rl != null && close < rl.price) {
      events.push({ breakIdx: i, swingIdx: rl.idx, levelPrice: rl.price, kind: trend === -1 ? 'BOS' : 'CHOCH', bullish: false });
      trend = -1;
      refLow = { idx: i, price: candles[i]!.low, isHigh: false };
      i++;
      continue;
    }
    i++;
  }
  return events;
}

// Ultima vela opuesta antes del impulso que rompio.
export function detectOrderBlocks(candles: CandleData[], events: SmcEvent[]): SmcZone[] {
  if (!candles.length || !events.length) return [];
  const out: SmcZone[] = [];
  for (const ev of events) {
    let found: number | null = null;
    for (let k = ev.breakIdx - 1; k >= Math.max(0, ev.breakIdx - SMC_OB_LOOKBACK); k--) {
      const c = candles[k]!;
      const opposite = ev.bullish ? c.close < c.open : c.close > c.open;
      if (opposite) {
        found = k;
        break;
      }
    }
    if (found == null) continue;
    const c = candles[found]!;
    let end = candles.length - 1;
    let mitigated = false;
    for (let m = found + 1; m < candles.length; m++) {
      const cl = candles[m]!.close;
      if (cl >= c.low && cl <= c.high) {
        end = m;
        mitigated = true;
        break;
      }
    }
    out.push({ startIdx: found, endIdx: end, top: c.high, bottom: c.low, bullish: ev.bullish, kind: 'ORDER_BLOCK', mitigated });
  }
  const bull = out.filter((z) => z.bullish).slice(-SMC_MAX_ZONES_PER_SIDE);
  const bear = out.filter((z) => !z.bullish).slice(-SMC_MAX_ZONES_PER_SIDE);
  return [...bull, ...bear].sort((a, b) => a.startIdx - b.startIdx);
}

// Imbalance de 3 velas con umbral ATR (sin threshold todo nace mitigado).
export function detectFvg(candles: CandleData[]): SmcZone[] {
  if (candles.length < 3) return [];
  const minGap = atr(candles) * 0.3;
  const out: SmcZone[] = [];
  for (let i = 2; i < candles.length; i++) {
    const a = candles[i - 2]!;
    const c = candles[i]!;
    if (c.low > a.high && c.low - a.high >= minGap) {
      let end = candles.length - 1;
      let mitigated = false;
      for (let m = i + 1; m < candles.length; m++) {
        if (candles[m]!.low <= c.low) {
          end = m;
          mitigated = true;
          break;
        }
      }
      out.push({ startIdx: i - 2, endIdx: end, top: c.low, bottom: a.high, bullish: true, kind: 'FVG', mitigated });
    } else if (c.high < a.low && a.low - c.high >= minGap) {
      let end = candles.length - 1;
      let mitigated = false;
      for (let m = i + 1; m < candles.length; m++) {
        if (candles[m]!.high >= c.high) {
          end = m;
          mitigated = true;
          break;
        }
      }
      out.push({ startIdx: i - 2, endIdx: end, top: a.low, bottom: c.high, bullish: false, kind: 'FVG', mitigated });
    }
  }
  const bull = out.filter((z) => z.bullish).slice(-SMC_MAX_ZONES_PER_SIDE);
  const bear = out.filter((z) => !z.bullish).slice(-SMC_MAX_ZONES_PER_SIDE);
  return [...bull, ...bear].sort((a, b) => a.startIdx - b.startIdx);
}

// Dos swings casi iguales = liquidez (nivel EQ).
export function detectEqLevels(candles: CandleData[], swings: SmcSwing[]): SmcEqLevel[] {
  if (swings.length < 2) return [];
  const tol = atr(candles) * 0.25;
  if (tol <= 0) return [];
  const out: SmcEqLevel[] = [];
  const pair = (list: SmcSwing[], isHigh: boolean) => {
    for (let a = 0; a < list.length; a++) {
      for (let b = a + 1; b < list.length; b++) {
        if (Math.abs(list[a]!.price - list[b]!.price) <= tol) {
          out.push({ price: (list[a]!.price + list[b]!.price) / 2, idx1: list[a]!.idx, idx2: list[b]!.idx, isHigh });
          break;
        }
      }
    }
  };
  pair(swings.filter((s) => s.isHigh), true);
  pair(swings.filter((s) => !s.isHigh), false);
  return out.slice(-6);
}

export function detectPremium(candles: CandleData[]): SmcPremiumRange | null {
  if (!candles.length) return null;
  const from = Math.max(0, candles.length - SMC_PREMIUM_LOOKBACK);
  let hi = -Infinity;
  let lo = Infinity;
  for (let i = from; i < candles.length; i++) {
    hi = Math.max(hi, candles[i]!.high);
    lo = Math.min(lo, candles[i]!.low);
  }
  if (!Number.isFinite(hi) || !Number.isFinite(lo) || hi <= lo) return null;
  return { high: hi, low: lo, equilibrium: (hi + lo) / 2 };
}

// Pool BSL sobre maximos, SSL bajo minimos; sweep = SFP estricto misma vela.
export function detectLiquidity(candles: CandleData[], swings: SmcSwing[]): SmcLiqLevel[] {
  if (!candles.length || !swings.length) return [];
  const tol = atr(candles) * 0.25;
  const dedupe = (list: SmcSwing[]): SmcSwing[] => {
    const recent = list.slice(-SMC_LIQ_SWINGS_PER_SIDE * 2);
    const kept: SmcSwing[] = [];
    for (const sw of recent) {
      if (!kept.some((k) => Math.abs(k.price - sw.price) <= tol)) kept.push(sw);
      else {
        for (let i = kept.length - 1; i >= 0; i--) {
          if (Math.abs(kept[i]!.price - sw.price) <= tol) kept.splice(i, 1);
        }
        kept.push(sw);
      }
    }
    return kept.slice(-SMC_LIQ_SWINGS_PER_SIDE);
  };
  const out: SmcLiqLevel[] = [];
  const levels: { sw: SmcSwing; buySide: boolean }[] = [
    ...dedupe(swings.filter((s) => s.isHigh)).map((sw) => ({ sw, buySide: true })),
    ...dedupe(swings.filter((s) => !s.isHigh)).map((sw) => ({ sw, buySide: false })),
  ];
  for (const { sw, buySide } of levels) {
    let swept: number | null = null;
    let consumed = false;
    for (let m = sw.idx + 1; m < candles.length; m++) {
      const c = candles[m]!;
      if (buySide) {
        if (c.high > sw.price && c.close < sw.price) {
          swept = m;
          break;
        }
        if (c.close > sw.price) {
          consumed = true;
          break;
        }
      } else {
        if (c.low < sw.price && c.close > sw.price) {
          swept = m;
          break;
        }
        if (c.close < sw.price) {
          consumed = true;
          break;
        }
      }
    }
    if (!consumed) out.push({ price: sw.price, idx: sw.idx, isBuySide: buySide, swept: swept != null, sweepIdx: swept });
  }
  return out.sort((a, b) => a.idx - b.idx);
}

// Agrega N velas en una para simular TFs mayores sin red.
export function aggregateByCount(candles: CandleData[], n: number): CandleData[] {
  if (n <= 1 || !candles.length) return candles;
  const out: CandleData[] = [];
  for (let i = 0; i < candles.length; i += n) {
    const end = Math.min(i + n, candles.length);
    const first = candles[i]!;
    const last = candles[end - 1]!;
    let hi = first.high;
    let lo = first.low;
    let vol = 0;
    for (let k = i; k < end; k++) {
      hi = Math.max(hi, candles[k]!.high);
      lo = Math.min(lo, candles[k]!.low);
      vol += candles[k]!.volume;
    }
    out.push({ time: first.time, open: first.open, high: hi, low: lo, close: last.close, volume: vol });
  }
  return out;
}

// 15m x4 -> 1h, etiqueta corta para el chip gris.
export function higherTfLabel(interval: string, factor: number): string {
  const baseMs = tfBaseMs(interval);
  if (baseMs <= 0) return 'HTF';
  const mins = (baseMs * factor) / 60_000;
  const standards = [1, 5, 15, 30, 60, 120, 240, 360, 720, 1440, 4320, 10080, 43200];
  const near = standards.reduce((a, b) => (Math.abs(b - mins) < Math.abs(a - mins) ? b : a));
  if (near < 60) return `${near}m`;
  if (near % 43200 === 0) return `${near / 43200}mo`;
  if (near % 10080 === 0) return `${near / 10080}w`;
  if (near % 1440 === 0) return `${near / 1440}d`;
  return `${near / 60}h`;
}

function tfBaseMs(interval: string): number {
  switch (interval.trim()) {
    case '1m': return 60_000;
    case '5m': return 300_000;
    case '15m': return 900_000;
    case '30m': return 1_800_000;
    case '1h': return 3_600_000;
    case '2h': return 7_200_000;
    case '4h': return 14_400_000;
    case '6h': return 21_600_000;
    case '12h': return 43_200_000;
    case '1d':
    case '3d':
    case '5d': return 86_400_000;
    case '1w':
    case '2w': return 604_800_000;
    case '1mo':
    case '1M': return 2_592_000_000;
    default: return 0;
  }
}

// FVG de TFs mayores (x4, x16) solapados con tus zonas = bandas grises.
export function detectFvgConfluence(candles: CandleData[], ownFvg: SmcZone[], interval: string): SmcConfluenceBand[] {
  const mine = ownFvg.filter((z) => z.kind === 'FVG' && !z.mitigated);
  if (!mine.length || candles.length < 32) return [];
  const bands: SmcConfluenceBand[] = [];
  for (const factor of [4, 16]) {
    const agg = aggregateByCount(candles, factor);
    if (agg.length < 8) continue;
    const label = higherTfLabel(interval, factor);
    for (const z of detectFvg(agg)) {
      for (const m of mine) {
        const top = Math.min(z.top, m.top);
        const bottom = Math.max(z.bottom, m.bottom);
        if (top > bottom) bands.push({ top, bottom, startIdx: m.startIdx, endIdx: m.endIdx, tfLabel: label });
      }
    }
  }
  const sorted = [...bands].sort((a, b) =>
    a.tfLabel.localeCompare(b.tfLabel) || a.bottom - b.bottom || a.top - b.top,
  );
  const merged: SmcConfluenceBand[] = [];
  for (const b of sorted) {
    const last = merged[merged.length - 1];
    if (last && last.tfLabel === b.tfLabel && b.bottom <= last.top) {
      merged[merged.length - 1] = {
        top: Math.max(last.top, b.top),
        bottom: Math.min(last.bottom, b.bottom),
        startIdx: Math.min(last.startIdx, b.startIdx),
        endIdx: Math.max(last.endIdx, b.endIdx),
        tfLabel: last.tfLabel,
      };
    } else {
      merged.push(b);
    }
  }
  return merged.slice(0, 10);
}

export function computeSmc(candles: CandleData[], interval = ''): SmcData {
  if (candles.length < SMC_SWING_LOOKBACK * 2 + 3) {
    return { swings: [], events: [], zones: [], eqLevels: [], premium: null, confluence: [], liquidity: [] };
  }
  const swings = detectSwings(candles);
  const events = detectStructure(candles, swings);
  const obZones = detectOrderBlocks(candles, events);
  const fvgZones = detectFvg(candles);
  const zones = [...obZones, ...fvgZones].sort((a, b) => a.startIdx - b.startIdx);
  return {
    swings,
    events: events.slice(-12),
    zones,
    eqLevels: detectEqLevels(candles, swings),
    premium: detectPremium(candles),
    confluence: detectFvgConfluence(candles, fvgZones, interval),
    liquidity: detectLiquidity(candles, swings),
  };
}

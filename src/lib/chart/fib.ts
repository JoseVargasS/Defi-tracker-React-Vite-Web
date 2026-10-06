import type { CandleData } from '@/lib/chart/rsi';

export interface FibAnchor {
  time: number;
  price: number;
}

export interface FibOverlay {
  id: string;
  start: FibAnchor;
  end: FibAnchor;
  colorHex: string;
  width: number;
  enabledLevels: number[];
  hidden: boolean;
  locked: boolean;
}

export const MAX_FIBS_PER_SYMBOL = 10;

export const DEFAULT_FIB_LEVELS = [0, 0.236, 0.382, 0.5, 0.618, 0.786, 1];
export const EXTRA_FIB_LEVELS = [1.272, 1.414, 1.618];
export const ALL_FIB_LEVELS = [...DEFAULT_FIB_LEVELS, ...EXTRA_FIB_LEVELS];

export function levelsSorted(overlay: FibOverlay): number[] {
  return overlay.enabledLevels.filter((l) => ALL_FIB_LEVELS.includes(l)).sort((a, b) => a - b);
}

// Agnostico a direccion, sirve alcista y bajista.
// Ojo: la app lo llama invertido (end, start): el 0 va en el punto final.
export function fibLevelPrice(start: number, end: number, ratio: number): number {
  return start + (end - start) * ratio;
}

// Distancia punto-segmento en pixeles para el hover de lineas de fibo.
export function pointToSegmentPx(
  px: number,
  py: number,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
): number {
  const dx = x1 - x0;
  const dy = y1 - y0;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) return Math.hypot(px - x0, py - y0);
  const t = Math.min(Math.max(((px - x0) * dx + (py - y0) * dy) / lenSq, 0), 1);
  return Math.hypot(px - (x0 + t * dx), py - (y0 + t * dy));
}

// Fibo cuya linea (cualquiera de sus niveles) pasa a menos de tolPx del mouse.
export function hitFibOverlay(
  overlays: FibOverlay[],
  mouse: { x: number; y: number },
  toX: (timeMs: number) => number | null,
  toY: (price: number) => number | null,
  tolPx = 8,
): FibOverlay | null {
  for (const o of overlays) {
    if (o.hidden) continue;
    const x0 = toX(o.start.time);
    const x1 = toX(o.end.time);
    if (x0 == null || x1 == null) continue;
    for (const ratio of levelsSorted(o)) {
      const price = fibLevelPrice(o.end.price, o.start.price, ratio);
      const y = toY(price);
      if (y == null) continue;
      if (pointToSegmentPx(mouse.x, mouse.y, x0, y, x1, y) <= tolPx) return o;
    }
  }
  return null;
}

// #RRGGBB con alpha para atenuar fibos no hovereados (seleccionado a full, resto tenues).
export function hexWithAlpha(hex: string, alpha: number): string | null {
  const m = /^#([0-9a-fA-F]{6})$/.exec(hex.trim());
  if (!m) return null;
  const n = parseInt(m[1]!, 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${alpha})`;
}

// Estilo TradingView: 3 decimales recortados y sin cero inicial (.618 en vez de 0.618).
export function trimRatio(ratio: number): string {
  if (!Number.isFinite(ratio)) return '0';
  const s = ratio.toFixed(3).replace(/0+$/, '').replace(/\.$/, '');
  if (s === '' || s === '-0') return '0';
  return s.startsWith('0.') ? s.slice(1) : s;
}

// Timestamp -> indice mas cercano, asi el fibo se reubica solo al agregar temporalidades.
export function timeToIndex(candles: CandleData[], time: number): number {
  if (!candles.length) return 0;
  let lo = 0;
  let hi = candles.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (candles[mid]!.time < time) lo = mid + 1;
    else hi = mid;
  }
  if (lo > 0 && Math.abs(candles[lo]!.time - time) > Math.abs(candles[lo - 1]!.time - time)) {
    return lo - 1;
  }
  return Math.min(Math.max(lo, 0), candles.length - 1);
}

const HEX_COLOR_RE = /^#([0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/;

// Encoding manual: id;sTime;sPrice;eTime;ePrice;color;width;lv1+lv2;hidden;locked
export function encodeFibOverlays(overlays: FibOverlay[]): string {
  return overlays.map((o) => [
    o.id,
    String(o.start.time),
    String(o.start.price),
    String(o.end.time),
    String(o.end.price),
    o.colorHex,
    String(o.width),
    [...o.enabledLevels].sort((a, b) => a - b).join('+'),
    o.hidden ? '1' : '0',
    o.locked ? '1' : '0',
  ].join(';')).join('|');
}

export function decodeFibOverlays(raw: string | null): FibOverlay[] {
  if (!raw || !raw.trim()) return [];
  return raw.split('|').flatMap((entry) => {
    const p = entry.split(';');
    if (p.length < 10) return [];
    const sTime = Number(p[1]);
    const sPrice = Number(p[2]);
    const eTime = Number(p[3]);
    const ePrice = Number(p[4]);
    if (!p[0] || ![sTime, sPrice, eTime, ePrice].every(Number.isFinite)) return [];
    const width = Math.min(Math.max(Number(p[6]) || 1, 0.5), 3);
    const levels = p[7]!.split('+').map(Number).filter((l) => ALL_FIB_LEVELS.includes(l));
    const overlay: FibOverlay = {
      id: p[0]!,
      start: { time: sTime, price: sPrice },
      end: { time: eTime, price: ePrice },
      colorHex: p[5] && HEX_COLOR_RE.test(p[5]) ? p[5]! : '#FFFFFF',
      width,
      enabledLevels: levels.length ? [...new Set(levels)] : [...DEFAULT_FIB_LEVELS],
      hidden: p[8] === '1',
      locked: p[9] === '1',
    };
    return [overlay];
  }).slice(0, MAX_FIBS_PER_SYMBOL);
}

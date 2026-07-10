export interface Candle {
  x: number;
  o: number;
  h: number;
  l: number;
  c: number;
  v: number;
  q: number;
}

export interface XY {
  x: number;
  y: number | null;
}

export type KlineRaw = [number, string, string, string, string, string, number, string, number, string, string, string];

export function normalizeKline(kline: KlineRaw): Candle {
  const o = Number(kline[1]);
  const c = Number(kline[4]);
  const fallback = (o + c) / 2 || 0;
  const rawH = Number(kline[2]);
  const rawL = Number(kline[3]);
  return {
    x: Number(kline[0]),
    o,
    h: Number.isFinite(rawH) ? rawH : fallback,
    l: Number.isFinite(rawL) ? rawL : fallback,
    c,
    v: Number(kline[5] ?? 0),
    q: Number(kline[7] ?? 0),
  };
}

export function compactNumber(value: number | string): string {
  const n = Number(value);
  if (!Number.isFinite(n)) return '-';
  return Intl.NumberFormat('en', {
    notation: 'compact',
    maximumFractionDigits: n >= 1000 ? 1 : 2,
  }).format(n);
}

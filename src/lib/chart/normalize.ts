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
  return {
    x: Number(kline[0]),
    o: Number(kline[1]),
    h: Number(kline[2]),
    l: Number(kline[3]),
    c: Number(kline[4]),
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

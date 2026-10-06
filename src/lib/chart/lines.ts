import type { UTCTimestamp } from 'lightweight-charts';

export interface LinePoint {
  time: UTCTimestamp;
  value: number;
}

// setData exige tiempos estrictamente ascendentes: ordena y colapsa
// duplicados (cierre de loops, clicks derecha-a-izquierda, redondeo a segundos).
export function toLineData(points: { time: UTCTimestamp; value: number }[]): LinePoint[] {
  const sorted = [...points].sort((a, b) => Number(a.time) - Number(b.time));
  const out: LinePoint[] = [];
  for (const p of sorted) {
    if (!Number.isFinite(p.value)) continue;
    if (out.length && out[out.length - 1]!.time === p.time) {
      out[out.length - 1] = { time: p.time, value: p.value };
    } else {
      out.push({ time: p.time, value: p.value });
    }
  }
  return out;
}

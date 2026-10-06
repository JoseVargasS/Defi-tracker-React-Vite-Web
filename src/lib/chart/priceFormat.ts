// Precision de costumbre: pares que tocaron sub-$1 conservan los ceros de su banda.
export function formatPriceForChart(value: number, extended = false): string {
  if (!Number.isFinite(value)) return '-';
  if (value === 0) return '0.00';
  const abs = Math.abs(value);
  if (extended && abs < 1) return value.toFixed(6);
  if (extended && value >= 1 && value < 10) return value.toFixed(4);
  if (abs >= 1000) {
    return value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }
  let s = value.toFixed(8);
  s = s.replace(/0+$/, '').replace(/\.$/, '');
  const frac = s.includes('.') ? s.split('.')[1]!.length : 0;
  if (frac < 2) return value.toFixed(2);
  return s;
}

// Decimales según magnitud: MACD 0.0011 -> 4, 123.4 -> 2.
export function precisionForValue(value: number): number {
  if (!Number.isFinite(value)) return 2;
  const a = Math.abs(value);
  if (a === 0) return 2;
  return Math.min(Math.max(Math.ceil(-Math.log10(a)) + 1, 2), 8);
}

// Volúmenes estilo app: 412.318K / 3.346M, 3 decimales.
export function compactVol3(value: number): string {
  if (!Number.isFinite(value)) return '-';
  const a = Math.abs(value);
  if (a >= 1_000_000) return `${(value / 1_000_000).toFixed(3)}M`;
  if (a >= 1000) return `${(value / 1000).toFixed(3)}K`;
  return value.toFixed(2);
}

// Cuenta regresiva al cierre de vela: MM:SS, con horas si pasa de 1h.
export function formatCountdown(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const mm = String(m).padStart(2, '0');
  const ss = String(s).padStart(2, '0');
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

// Eje/tags/fibo con los mismos decimales del precio actual, sin colas largas.
export function formatAxisPrice(value: number, refClose: number, extended = false): string {
  if (!Number.isFinite(value)) return '-';
  if (value === 0) return '0.00';
  const abs = Math.abs(value);
  if (extended && abs < 1) return value.toFixed(6);
  if (extended && value >= 1 && value < 10) return value.toFixed(4);
  if (abs >= 1000) {
    return value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }
  const frac = formatPriceForChart(refClose, extended).split('.')[1]?.length ?? 2;
  const n = Math.min(Math.max(frac, 2), 8);
  return value.toFixed(n);
}

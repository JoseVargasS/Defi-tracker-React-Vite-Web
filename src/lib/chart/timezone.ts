export type TzTickKind = 'time' | 'day' | 'month' | 'year';

// Intl es caro de construir: un juego por zona y se reusa en cada tick.
const formatterCache = new Map<string, Intl.DateTimeFormat>();

function formatter(zone: string, opts: Intl.DateTimeFormatOptions): Intl.DateTimeFormat {
  const key = `${zone}|${opts.day ?? ''}|${opts.month ?? ''}|${opts.year ?? ''}|${opts.hour ?? ''}|${opts.minute ?? ''}|${opts.second ?? ''}`;
  const hit = formatterCache.get(key);
  if (hit) return hit;
  const fmt = new Intl.DateTimeFormat('es-PE', { ...opts, timeZone: zone, hour12: false });
  formatterCache.set(key, fmt);
  return fmt;
}

export function formatTickInZone(timeSec: number, kind: TzTickKind, zone: string): string {
  const date = new Date(timeSec * 1000);
  try {
    switch (kind) {
      case 'time':
        return formatter(zone, { hour: '2-digit', minute: '2-digit' }).format(date);
      case 'day':
        return formatter(zone, { day: 'numeric', month: 'short' }).format(date);
      case 'month':
        return formatter(zone, { month: 'short', year: '2-digit' }).format(date);
      case 'year':
        return formatter(zone, { year: 'numeric' }).format(date);
    }
  } catch {
    return String(timeSec);
  }
}

export function formatCrosshairInZone(timeSec: number, zone: string): string {
  try {
    return formatter(zone, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
      .format(new Date(timeSec * 1000));
  } catch {
    return String(timeSec);
  }
}

export function formatClockInZone(nowMs: number, zone: string): string {
  try {
    return formatter(zone, { hour: '2-digit', minute: '2-digit', second: '2-digit' })
      .format(new Date(nowMs));
  } catch {
    return '';
  }
}

// "UTC-5" estilo TradingView, calculado con la fecha actual (respeta DST).
export function zoneOffsetLabel(zone: string, nowMs: number = Date.now()): string {
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: zone,
      timeZoneName: 'shortOffset',
    }).formatToParts(new Date(nowMs));
    const name = parts.find((p) => p.type === 'timeZoneName')?.value ?? '';
    const m = /^GMT([+-]\d{1,2})(?::(\d{2}))?$/.exec(name);
    if (m) {
      const zero = Number(m[1]) === 0 && (!m[2] || m[2] === '00');
      if (zero) return 'UTC';
      return `UTC${m[1]}${m[2] && m[2] !== '00' ? `:${m[2]}` : ''}`;
    }
    if (name === 'GMT') return 'UTC';
    return name || zone;
  } catch {
    return zone;
  }
}

export function zoneShortName(zone: string): string {
  const parts = zone.split('/');
  return parts[parts.length - 1]!.replace(/_/g, ' ');
}

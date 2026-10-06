import type { FibAnchor } from '@/lib/chart/fib';

export type DrawKind =
  | 'SEGMENT' | 'LINE' | 'RAY' | 'ARROW'
  | 'H_SEGMENT' | 'H_LINE' | 'H_RAY'
  | 'RECT' | 'CIRCLE' | 'TRIANGLE'
  | 'PRICE_LINE';

const DRAW_KINDS: readonly DrawKind[] = [
  'SEGMENT', 'LINE', 'RAY', 'ARROW',
  'H_SEGMENT', 'H_LINE', 'H_RAY',
  'RECT', 'CIRCLE', 'TRIANGLE',
  'PRICE_LINE',
];

export function isDrawKind(value: unknown): value is DrawKind {
  return typeof value === 'string' && (DRAW_KINDS as readonly string[]).includes(value);
}

export interface DrawOverlay {
  id: string;
  kind: DrawKind;
  start: FibAnchor;
  end: FibAnchor;
  colorHex: string;
  width: number;
  hidden: boolean;
  locked: boolean;
}

export const MAX_DRAWS_PER_SYMBOL = 20;

const HEX_COLOR_RE = /^#([0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/;

// Encoding manual: id;kind;sTime;sPrice;eTime;ePrice;color;width;hidden;locked
export function encodeDrawOverlays(overlays: DrawOverlay[]): string {
  return overlays.map((o) => [
    o.id, o.kind,
    String(o.start.time), String(o.start.price),
    String(o.end.time), String(o.end.price),
    o.colorHex, String(o.width),
    o.hidden ? '1' : '0', o.locked ? '1' : '0',
  ].join(';')).join('|');
}

export function decodeDrawOverlays(raw: string | null): DrawOverlay[] {
  if (!raw || !raw.trim()) return [];
  return raw.split('|').flatMap((entry) => {
    const p = entry.split(';');
    if (p.length < 10 || !isDrawKind(p[1])) return [];
    const sTime = Number(p[2]);
    const sPrice = Number(p[3]);
    const eTime = Number(p[4]);
    const ePrice = Number(p[5]);
    if (!p[0] || ![sTime, sPrice, eTime, ePrice].every(Number.isFinite)) return [];
    const overlay: DrawOverlay = {
      id: p[0]!,
      kind: p[1] as DrawKind,
      start: { time: sTime, price: sPrice },
      end: { time: eTime, price: ePrice },
      colorHex: p[6] && HEX_COLOR_RE.test(p[6]) ? p[6]! : '#FFD60A',
      width: Math.min(Math.max(Number(p[7]) || 1, 0.5), 3),
      hidden: p[8] === '1',
      locked: p[9] === '1',
    };
    return [overlay];
  }).slice(0, MAX_DRAWS_PER_SYMBOL);
}

export function drawKindLabel(kind: DrawKind): string {
  switch (kind) {
    case 'SEGMENT': return 'Segmento';
    case 'LINE': return 'Línea';
    case 'RAY': return 'Recta';
    case 'ARROW': return 'Flecha';
    case 'H_SEGMENT': return 'Segmento H';
    case 'H_LINE': return 'Línea H';
    case 'H_RAY': return 'Recta H';
    case 'RECT': return 'Rectángulo';
    case 'CIRCLE': return 'Círculo';
    case 'TRIANGLE': return 'Triángulo';
    case 'PRICE_LINE': return 'Línea de precio';
  }
}

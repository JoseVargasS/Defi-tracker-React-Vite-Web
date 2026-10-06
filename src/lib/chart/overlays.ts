import { decodeDrawOverlays, encodeDrawOverlays, type DrawOverlay } from '@/lib/chart/draw';
import { decodeFibOverlays, encodeFibOverlays, type FibOverlay } from '@/lib/chart/fib';

const fibKey = (symbol: string) => `fib_overlays_${symbol}`;
const drawKey = (symbol: string) => `draw_overlays_${symbol}`;

export function loadFibOverlays(symbol: string): FibOverlay[] {
  try {
    return decodeFibOverlays(localStorage.getItem(fibKey(symbol)));
  } catch {
    return [];
  }
}

export function saveFibOverlays(symbol: string, overlays: FibOverlay[]): void {
  try {
    localStorage.setItem(fibKey(symbol), encodeFibOverlays(overlays));
  } catch {
    // almacenamiento lleno
  }
}

export function loadDrawOverlays(symbol: string): DrawOverlay[] {
  try {
    return decodeDrawOverlays(localStorage.getItem(drawKey(symbol)));
  } catch {
    return [];
  }
}

export function saveDrawOverlays(symbol: string, overlays: DrawOverlay[]): void {
  try {
    localStorage.setItem(drawKey(symbol), encodeDrawOverlays(overlays));
  } catch {
    // almacenamiento lleno
  }
}

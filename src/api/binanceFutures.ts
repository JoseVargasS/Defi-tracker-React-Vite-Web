import { makeRequest } from '@/api/client';
import { BINANCE_FUTURES_API, hasNativeTakerInterval } from '@/lib/config';

export interface TakerVolume {
  timeMs: number;
  buy: number;
  sell: number;
}

interface BinanceTakerRow {
  buyVol?: string | null;
  sellVol?: string | null;
  timestamp?: number;
}

// Buy/sell del tomador siempre desde Binance Futuros (MEXC no lo expone).
// En TFs sin periodo nativo devuelve vacio. MEXC se mapea quitando el "_".
export async function fetchTakerVolumes(
  symbol: string,
  interval: string,
  source: 'Binance' | 'MEXC' | 'TV' = 'Binance',
  limit = 500,
): Promise<TakerVolume[]> {
  if (!hasNativeTakerInterval(interval)) return [];
  if (source === 'TV') return [];
  const binSymbol = source === 'MEXC' ? symbol.replace(/_/g, '') : symbol;
  const cleanLimit = Math.min(Math.max(limit, 2), 500);
  try {
    const res = (await makeRequest(
      `${BINANCE_FUTURES_API}/futures/data/takerlongshortRatio?symbol=${encodeURIComponent(binSymbol)}&period=${encodeURIComponent(interval.trim())}&limit=${cleanLimit}`,
    )) as BinanceTakerRow[];
    if (!Array.isArray(res)) return [];
    return res.flatMap((row) => {
      const timeMs = Number(row.timestamp ?? 0);
      if (!(timeMs > 0)) return [];
      return [{ timeMs, buy: Number(row.buyVol ?? 0) || 0, sell: Number(row.sellVol ?? 0) || 0 }];
    });
  } catch (err) {
    console.warn('fetchTakerVolumes error', symbol, err);
    return [];
  }
}

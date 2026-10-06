import { pairKey, type PairSource } from '@/lib/config';

export const BINANCE_WS_URL = 'wss://stream.binance.com:9443/stream?streams=!miniTicker@arr';
export const MEXC_WS_URL = 'wss://contract.mexc.com/edge';
const MEXC_SUB_MSG = '{"method":"sub.tickers","param":{}}';
const MEXC_PING_MSG = '{"method":"ping"}';
const MEXC_PING_MS = 15_000;

export interface LiveQuote {
  price: number;
  changePercent: number;
  isPositive: boolean;
  quoteVolume: number;
}

export type LiveBatch = Record<string, LiveQuote>;

// Tick crudo Binance !miniTicker@arr: precio, open 24h y volumen quote.
export function parseBinanceMiniTicker(data: unknown): LiveBatch {
  const arr = (data as { data?: unknown })?.data;
  if (!Array.isArray(arr)) return {};
  const out: LiveBatch = {};
  for (const t of arr) {
    const tick = t as Record<string, unknown>;
    const symbol = String(tick.s ?? '');
    const close = Number(tick.c);
    const open = Number(tick.o);
    if (!symbol || !(close > 0) || !(open > 0)) continue;
    const pct = ((close - open) / open) * 100;
    out[pairKey(symbol, 'Binance')] = {
      price: close,
      changePercent: pct,
      isPositive: pct >= 0,
      quoteVolume: Number(tick.q ?? 0) || 0,
    };
  }
  return out;
}

// Tick crudo MEXC push.tickers: ultimo precio, tasa 24h y volumen en contratos.
export function parseMexcTickers(data: unknown): LiveBatch {
  const root = data as Record<string, unknown>;
  if (root?.channel !== 'push.tickers') return {};
  const arr = root.data;
  if (!Array.isArray(arr)) return {};
  const out: LiveBatch = {};
  for (const t of arr) {
    const tick = t as Record<string, unknown>;
    const symbol = String(tick.symbol ?? '');
    const last = Number(tick.lastPrice);
    if (!symbol || !Number.isFinite(last) || !(last > 0)) continue;
    const rate = Number(tick.riseFallRate ?? 0) || 0;
    const pct = rate * 100;
    const volume24 = Number(tick.volume24 ?? 0) || 0;
    out[pairKey(symbol, 'MEXC')] = {
      price: last,
      changePercent: pct,
      isPositive: pct >= 0,
      quoteVolume: last * volume24,
    };
  }
  return out;
}

export function liveQuoteFor(source: PairSource, symbol: string, batch: LiveBatch): LiveQuote | null {
  return batch[pairKey(symbol, source)] ?? null;
}

interface SocketOpts {
  parse: (data: unknown) => LiveBatch;
  onBatch: (batch: LiveBatch) => void;
  onOpenExtra?: (ws: WebSocket) => void;
}

function connectWithRetry(url: string, opts: SocketOpts): () => void {
  let closed = false;
  let attempt = 0;
  let ws: WebSocket | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;

  const connect = () => {
    if (closed) return;
    try {
      ws = new WebSocket(url);
    } catch {
      schedule();
      return;
    }
    ws.onopen = () => {
      attempt = 0;
      if (ws) opts.onOpenExtra?.(ws);
    };
    ws.onmessage = (event) => {
      try {
        const batch = opts.parse(JSON.parse(String(event.data)));
        if (Object.keys(batch).length) opts.onBatch(batch);
      } catch {
        // frame no-JSON: se ignora, el socket sigue vivo
      }
    };
    ws.onclose = () => schedule();
    ws.onerror = () => {
      try {
        ws?.close();
      } catch {
        // cierre best-effort tras error
      }
    };
  };

  const schedule = () => {
    if (closed) return;
    attempt++;
    const waitMs = Math.min(2_000 * 2 ** Math.min(attempt, 4), 30_000);
    timer = setTimeout(connect, waitMs);
  };

  connect();
  return () => {
    closed = true;
    if (timer !== null) clearTimeout(timer);
    try {
      ws?.close();
    } catch {
      // cierre best-effort
    }
  };
}

// Junta ambos sockets en un mapa key "$symbol-$source"; si un socket falla,
// el otro sigue emitiendo. Reconnect exponencial 2s -> 30s.
export function connectLivePrices(onBatch: (batch: LiveBatch) => void): () => void {
  let pingTimer: ReturnType<typeof setInterval> | null = null;
  const stopBinance = connectWithRetry(BINANCE_WS_URL, {
    parse: parseBinanceMiniTicker,
    onBatch,
  });
  const stopMexc = connectWithRetry(MEXC_WS_URL, {
    parse: parseMexcTickers,
    onBatch,
    onOpenExtra: (ws) => {
      try {
        ws.send(MEXC_SUB_MSG);
      } catch {
        // si el sub falla el server cierra y el retry reintenta
      }
      if (pingTimer !== null) clearInterval(pingTimer);
      pingTimer = setInterval(() => {
        try {
          if (ws.readyState === WebSocket.OPEN) ws.send(MEXC_PING_MSG);
        } catch {
          // el server tumba la conexion y el retry la levanta
        }
      }, MEXC_PING_MS);
    },
  });
  return () => {
    stopBinance();
    stopMexc();
    if (pingTimer !== null) clearInterval(pingTimer);
  };
}

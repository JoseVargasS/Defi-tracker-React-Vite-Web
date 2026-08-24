import { OPENCODE_GO_KEY } from '@/lib/config';
import { fetchKlines, fetchPrice } from '@/api/binance';
import { calculateSMA } from '@/lib/chart/indicators';
import { normalizeKline, type Candle, type KlineRaw } from '@/lib/chart/normalize';

// ponytail: hy3-free es el free mas directo; cambiar via VITE_OPENCODE_MODEL o el selector del chat
export const DEFAULT_MODEL = import.meta.env.VITE_OPENCODE_MODEL || 'hy3-free';

// Produccion usa el proxy Cloudflare (opencode.ai no soporta CORS desde el navegador);
// si no hay proxy configurado cae al endpoint directo (requiere key en el bundle).
const AI_PROXY_URL = import.meta.env.VITE_AI_PROXY_URL || '';
const GO_ENDPOINT = import.meta.env.DEV
  ? '/api/zen'
  : AI_PROXY_URL || 'https://opencode.ai/zen/v1/chat/completions';

// Free verificadas contra /zen/v1/chat/completions (muse-spark free usa otro endpoint y queda fuera)
export interface FreeModel {
  id: string;
  label: string;
  provider: string;
}

export const FREE_MODELS: FreeModel[] = [
  { id: 'hy3-free', label: 'Hy3', provider: 'Tencent' },
  { id: 'x-preview-f-free', label: 'Ox Alpha', provider: 'OpenCode' },
  { id: 'mimo-v2.5-free', label: 'MiMo V2.5', provider: 'Xiaomi' },
  { id: 'big-pickle', label: 'Big Pickle', provider: 'OpenCode' },
  { id: 'nemotron-3-ultra-free', label: 'Nemotron 3 Ultra', provider: 'NVIDIA' },
  { id: 'nemotron-3.5-lightning-free', label: 'Nemotron 3.5 Lightning', provider: 'NVIDIA' },
];


interface GoMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

interface GoCompletionOptions {
  model?: string;
  temperature?: number;
  maxTokens?: number;
}

// ponytail: 1 reintento en 429/5xx; sin failover entre modelos (encadenar 6 x 60s era peor)
const RETRYABLE_STATUSES = new Set([429, 500, 502, 503, 504]);
// ponytail: tope 60s por intento para no colgar el chat indefinido
const MODEL_TIMEOUT_MS = 60_000;

export async function goChatCompletion(
  messages: GoMessage[],
  opts: GoCompletionOptions = {},
): Promise<string> {
  const apiKey = OPENCODE_GO_KEY;
  const hasKey = Boolean(apiKey && apiKey !== 'replace-me');
  // Sin key local solo se permite si el proxy de produccion pone la key el
  if (!hasKey && !(import.meta.env.PROD && AI_PROXY_URL)) {
    throw new Error('Falta OPENCODE_GO_KEY en .env');
  }
  let lastError = 'Error desconocido';
  for (let attempt = 0; attempt < 2; attempt++) {
    if (attempt > 0) await new Promise((r) => setTimeout(r, 800));
    try {
      const res = await fetch(GO_ENDPOINT, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(hasKey ? { Authorization: `Bearer ${apiKey}` } : {}),
        },
        signal: AbortSignal.timeout(MODEL_TIMEOUT_MS),
        body: JSON.stringify({
          model: opts.model ?? DEFAULT_MODEL,
          messages,
          temperature: opts.temperature ?? 0.3,
          max_tokens: opts.maxTokens ?? 2500,
        }),
      });
      if (res.ok) {
        const json = await res.json();
        const content: string | undefined = json.choices?.[0]?.message?.content;
        if (content) return content;
        lastError = 'El modelo devolvio una respuesta vacia';
        continue;
      }
      const body = await res.text().catch(() => '');
      lastError = `HTTP ${res.status}${body ? `: ${body.slice(0, 120)}` : ''}`;
      if (!RETRYABLE_STATUSES.has(res.status)) break;
    } catch (err) {
      if (err instanceof Error && err.name === 'TimeoutError') {
        lastError = 'El modelo tardo demasiado (60s). Intenta de nuevo o cambia de modelo.';
        break;
      }
      lastError = 'Sin conexion con el servidor de IA';
    }
  }
  throw new Error(lastError);
}

const ANALYSIS_INTERVALS = ['5m', '15m', '1h', '2h', '4h', '1d'] as const;
const SMA_PERIODS = [9, 25, 50, 75, 100, 150, 200] as const;
// ponytail: timeout fijo 5s; es dato complementario, no debe frenar la respuesta
const EXTERNAL_FETCH_TIMEOUT_MS = 5_000;

function fetchWithTimeout(url: string): Promise<Response> {
  return fetch(url, { signal: AbortSignal.timeout(EXTERNAL_FETCH_TIMEOUT_MS) });
}

function findSwingLevels(candles: Candle[]): { supports: number[]; resistances: number[] } {
  const lookback = 3;
  const supports: number[] = [];
  const resistances: number[] = [];
  for (let i = lookback; i < candles.length - lookback; i++) {
    let isSwingLow = true;
    let isSwingHigh = true;
    for (let j = i - lookback; j <= i + lookback; j++) {
      if (j === i) continue;
      if (candles[j]!.l <= candles[i]!.l) isSwingLow = false;
      if (candles[j]!.h >= candles[i]!.h) isSwingHigh = false;
    }
    if (isSwingLow) supports.push(candles[i]!.l);
    if (isSwingHigh) resistances.push(candles[i]!.h);
  }
  const merge = (levels: number[], tolerance: number): number[] => {
    if (!levels.length) return [];
    const sorted = [...levels].sort((a, b) => a - b);
    const result: number[] = [sorted[0]!];
    for (let i = 1; i < sorted.length; i++) {
      const prev = result[result.length - 1]!;
      if (Math.abs(sorted[i]! - prev) / Math.max(prev, 0.01) > tolerance) {
        result.push(sorted[i]!);
      }
    }
    return result;
  };
  return {
    supports: merge(supports, 0.008).slice(-5),
    resistances: merge(resistances, 0.008).slice(-5),
  };
}

// ponytail: 6 cifras significativas cubre desde BTC hasta micro-caps sin perder decimales
export function formatSignificant(n: number): string {
  return String(Number(n.toPrecision(6)));
}

function formatCandle(c: Candle): string {
  return `O:${formatSignificant(c.o)} H:${formatSignificant(c.h)} L:${formatSignificant(c.l)} C:${formatSignificant(c.c)} V:${c.v.toFixed(0)}`;
}

function smaLabel(series: { y: number | null }[]): string {
  const last = series[series.length - 1];
  return last?.y != null ? formatSignificant(last.y) : 'N/A';
}

export async function buildTechnicalPrompt(pair: string): Promise<string> {
  // ponytail: las 6 temporalidades en paralelo; en serie eran 6 RTTs de Binance
  const raws = await Promise.all(
    ANALYSIS_INTERVALS.map((interval) => fetchKlines(pair, interval, 250).catch(() => null)),
  );
  const parts: string[] = [];
  ANALYSIS_INTERVALS.forEach((interval, i) => {
    const raw = raws[i];
    if (!Array.isArray(raw) || raw.length < 50) return;
    const candles = (raw as unknown as KlineRaw[]).map(k => normalizeKline(k));
    const current = candles[candles.length - 1]!;
    const smas = SMA_PERIODS.map(p => {
      const series = calculateSMA(candles, p);
      return `SMA${p}:${smaLabel(series)}`;
    }).join(' ');
    const { supports, resistances } = findSwingLevels(candles);
    parts.push(
      `[${interval}] ${formatCandle(current)} | ${smas}` +
      ` | SR:${supports.length ? ' S:' + supports.map(formatSignificant).join(',') : ' S:N/A'}` +
      `${resistances.length ? ' R:' + resistances.map(formatSignificant).join(',') : ' R:N/A'}`,
    );
  });
  return parts.join('\n');
}

export async function buildExternalPrompt(): Promise<string> {
  const [btc, eth, newsData] = await Promise.all([
    fetchPrice('BTCUSDT').catch(() => null),
    fetchPrice('ETHUSDT').catch(() => null),
    fetchWithTimeout('https://cryptocurrency.cv/api/news?limit=10').catch(() => null),
  ]);
  const btcPrice = btc?.price ? Number(btc.price) : null;
  const ethPrice = eth?.price ? Number(eth.price) : null;
  const ratio = btcPrice && ethPrice ? (ethPrice / btcPrice).toFixed(6) : 'N/A';
  let newsLines = '(sin noticias)';
  if (newsData?.ok) {
    try {
      const json = await newsData.json();
      const arts = Array.isArray(json?.articles) ? json.articles : Array.isArray(json?.data) ? json.data : [];
      if (arts.length) {
        newsLines = arts.slice(0, 8).map((a: Record<string, string>) =>
          `- ${a.title ?? ''}`,
        ).join('\n');
      }
    } catch { /* ignore */ }
  }
  return [
    `BTC: ${btcPrice != null ? '$' + btcPrice.toLocaleString() : 'N/A'}`,
    `ETH: ${ethPrice != null ? '$' + ethPrice.toLocaleString() : 'N/A'}`,
    `ETH/BTC: ${ratio}`,
    '',
    'Noticias recientes:',
    newsLines,
  ].join('\n');
}

export async function searchWeb(query: string): Promise<string> {
  const [wiki, news] = await Promise.all([
    fetchWithTimeout(`https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(query)}&srlimit=5&format=json&origin=*`)
      .then(r => r.ok ? r.json() : null).catch(() => null),
    fetchWithTimeout(`https://cryptocurrency.cv/api/news?limit=10&search=${encodeURIComponent(query)}`)
      .then(r => r.ok ? r.json() : null).catch(() => null),
  ]);
  const parts: string[] = [];
  const wikiResults = wiki?.query?.search;
  if (Array.isArray(wikiResults) && wikiResults.length) {
    parts.push('Resultados de Wikipedia:');
    wikiResults.slice(0, 4).forEach((r: Record<string, string>) => {
      parts.push(`- ${r.title}: ${r.snippet?.replace(/<[^>]+>/g, '') ?? ''}`);
    });
  }
  if (news) {
    const arts = Array.isArray(news?.articles) ? news.articles : Array.isArray(news?.data) ? news.data : [];
    if (arts.length) {
      parts.push('Noticias crypto:');
      arts.slice(0, 4).forEach((a: Record<string, string>) => parts.push(`- ${a.title ?? ''}`));
    }
  }
  return parts.length ? parts.join('\n') : '';
}

export function systemPromptForTechnical(pair: string): string {
  return `Eres un analista tecnico experto en trading de criptomonedas. Analiza las velas y SMA de ${pair} en 6 temporalidades (5m, 15m, 1h, 2h, 4h, 1d). Proporciona: 1) Tendencia general en cada temporalidad, 2) Soportes y resistencias clave, 3) Recomendacion de entrada indicando si es buena oportunidad para SHORT o LONG, 4) En que temporalidades operar (scalping, corto plazo, largo plazo), 5) Niveles clave a vigilar. Se conciso.`;
}

export const SYSTEM_PROMPT_EXTERNAL = `Eres un analista macroeconomico experto en criptomonedas. Analiza como los factores externos actuales afectan a ETH y BTC. Considera: dominancia BTC, ratio ETH/BTC, noticias recientes, FED, inflacion, guerras, petroleo, S&P500, ETFs, etc. Proporciona: 1) Contexto macro, 2) Impacto en BTC y ETH, 3) Proyeccion. Se conciso.`;

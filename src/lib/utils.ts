export function formatPrice(price: number | string): string {
  const n = typeof price === 'string' ? parseFloat(price) : price;
  if (isNaN(n)) return '-';
  return n < 1 ? n.toFixed(4) : n.toFixed(2);
}

export function escapeHTML(value: string | number | null | undefined): string {
  return String(value ?? '').replace(/[&<>"']/g, char =>
    ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;',
    })[char] ?? '',
  );
}

export function safeImageUrl(value: string, fallback = ''): string {
  const url = String(value ?? '').trim();
  if (!url) return fallback;
  if (url.startsWith('//')) return `https:${url}`;
  if (url.startsWith('./') || url.startsWith('/')) return url;
  try {
    const parsed = new URL(url);
    return ['https:', 'http:'].includes(parsed.protocol) ? parsed.href : fallback;
  } catch {
    return fallback;
  }
}

export function safeErrorMessage(
  error: unknown,
  fallback = 'Ocurrio un error al cargar los datos.',
): string {
  const message =
    error instanceof Error ? error.message : String(error ?? '');
  if (!message || message.length > 180) return fallback;
  if (/[<>{}[\]();]/.test(message)) return fallback;
  return message;
}

export function apiStatusMessage(status: number, source = 'API'): string {
  if (status === 401)
    return `${source} rechazo la API key (401). Revisa la configuracion en .env.`;
  if (status === 406)
    return `${source} rechazo la consulta (406). Limpia datos locales o espera unos segundos antes de reintentar.`;
  if (status === 409)
    return `${source} esta sincronizando datos. Reintenta en unos segundos.`;
  if (status === 429)
    return `${source} esta limitando solicitudes (429). Espera un momento antes de consultar de nuevo.`;
  return `No se pudo completar la consulta en ${source}.`;
}

export async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  mapper: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let cursor = 0;

  async function worker() {
    while (cursor < items.length) {
      const index = cursor++;
      results[index] = await mapper(items[index] as T, index);
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, () => worker()),
  );
  return results;
}

export function integerAmountToNumber(value: string | number, decimals = 18): number {
  try {
    const raw = String(value || '0');
    const dec = Number.isFinite(Number(decimals)) ? Number(decimals) : 18;
    if (raw.includes('.')) return Number(raw) || 0;
    if (!/^\d+$/.test(raw)) return Number(raw) || 0;
    if (raw.length <= 15) return Number(raw) / Math.pow(10, dec);

    const big = BigInt(raw);
    const base = BigInt(10) ** BigInt(dec);
    const intPart = big / base;
    const fracPart = big % base;
    const fracStr = fracPart.toString().padStart(dec, '0').slice(0, 8).padEnd(8, '0');
    return Number(`${intPart.toString()}.${fracStr}`) || 0;
  } catch {
    return 0;
  }
}

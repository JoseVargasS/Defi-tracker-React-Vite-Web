import { COINSTATS_API, COINSTATS_API_KEY } from '@/lib/config';
import { safeErrorMessage } from '@/lib/utils';

function redactUrl(url: string): string {
  try {
    const parsed = new URL(url);
    ['apikey', 'apiKey', 'key', 'token'].forEach(param => {
      if (parsed.searchParams.has(param))
        parsed.searchParams.set(param, '[redacted]');
    });
    return parsed.toString();
  } catch {
    return '[invalid-url]';
  }
}

export async function makeRequest(
  url: string,
  options: RequestInit = {},
  retryCount = 0,
): Promise<unknown> {
  try {
    const headers: Record<string, string> = {
      Accept: 'application/json',
      ...(options.headers as Record<string, string> | undefined),
    };
    if (url.startsWith(COINSTATS_API)) {
      if (!COINSTATS_API_KEY || COINSTATS_API_KEY === 'replace-me') {
        throw new Error('Missing COINSTATS_API_KEY runtime config');
      }
      headers['X-API-KEY'] = COINSTATS_API_KEY;
    }
    const res = await fetch(url, { ...options, credentials: 'omit', headers });

    if ((res.status === 406 || res.status === 429) && retryCount < 1) {
      const retryAfter = Number(res.headers.get('Retry-After'));
      const waitMs = Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : 2500;
      await new Promise(r => setTimeout(r, waitMs));
      return makeRequest(url, options, retryCount + 1);
    }

    if (!res.ok) {
      const error = new Error(`HTTP ${res.status} ${res.statusText}`);
      (error as Error & { status: number }).status = res.status;
      throw error;
    }
    return res.json().catch(() => null);
  } catch (err) {
    const status = (err as Error & { status?: number }).status;
    if (!status || ![400, 406, 429].includes(status)) {
      console.error('makeRequest error', redactUrl(url), safeErrorMessage(err));
    }
    throw err;
  }
}

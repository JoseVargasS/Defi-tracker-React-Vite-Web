// js/utils.js
import { COINSTATS_API, COINSTATS_API_KEY } from './config.js';

export function formatPrice(price) {
  price = parseFloat(price);
  if (isNaN(price)) return '-';
  return price < 1 ? price.toFixed(4) : price.toFixed(2);
}

export function escapeHTML(value) {
  return String(value ?? '').replace(/[&<>"']/g, char => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  })[char]);
}

export function safeImageUrl(value, fallback = '') {
  const url = String(value ?? '').trim();
  if (!url) return fallback;
  if (url.startsWith('./') || url.startsWith('/')) return url;

  try {
    const parsed = new URL(url);
    return ['https:', 'http:'].includes(parsed.protocol) ? parsed.href : fallback;
  } catch {
    return fallback;
  }
}

export function safeErrorMessage(error, fallback = 'Ocurrio un error al cargar los datos.') {
  const message = error?.message || String(error || '');
  if (!message || message.length > 180) return fallback;
  if (/[<>{}[\]();]/.test(message)) return fallback;
  return message;
}

export function apiStatusMessage(status, source = 'API') {
  if (status === 401) return `${source} rechazo la API key (401). Revisa la configuracion en .env.`;
  if (status === 406) return `${source} rechazo la consulta (406). Limpia datos locales o espera unos segundos antes de reintentar.`;
  if (status === 409) return `${source} esta sincronizando datos. Reintenta en unos segundos.`;
  if (status === 429) return `${source} esta limitando solicitudes (429). Espera un momento antes de consultar de nuevo.`;
  return `No se pudo completar la consulta en ${source}.`;
}

function redactUrl(value) {
  try {
    const parsed = new URL(value);
    ['apikey', 'apiKey', 'key', 'token'].forEach(param => {
      if (parsed.searchParams.has(param)) parsed.searchParams.set(param, '[redacted]');
    });
    return parsed.toString();
  } catch {
    return '[invalid-url]';
  }
}

export async function makeRequest(url, options = {}, retryCount = 0) {
  try {
    const headers = { 'Accept': 'application/json', ...(options.headers || {}) };
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
      error.status = res.status;
      throw error;
    }
    const data = await res.json().catch(() => null);
    return data;
  } catch (err) {
    // Only log errors that aren't 400 (Bad Request) for unknown tokens
    // And don't log 429 if we're still going to fail after retry
    if (!err.status || ![400, 406, 429].includes(err.status)) {
      console.error('makeRequest error', redactUrl(url), safeErrorMessage(err));
    }
    throw err;
  }
}


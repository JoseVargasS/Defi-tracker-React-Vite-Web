import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('@/lib/config', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  OPENCODE_GO_KEY: 'test-key',
}));

vi.mock('@/api/binance', () => ({
  fetchKlines: vi.fn(),
  fetchPrice: vi.fn().mockResolvedValue(null),
}));

import { buildTechnicalPrompt, formatSignificant, goChatCompletion } from '@/api/opencode';
import { fetchKlines } from '@/api/binance';
import type { KlineRaw } from '@/lib/chart/normalize';

function fetchOk(content: string) {
  return {
    ok: true,
    status: 200,
    json: () => Promise.resolve({ choices: [{ message: { content } }] }),
    text: () => Promise.resolve(''),
  };
}

function fetchFail(status: number) {
  return {
    ok: false,
    status,
    json: () => Promise.resolve({}),
    text: () => Promise.resolve('{"type":"error"}'),
  };
}

function tinyPriceKlines(): KlineRaw[] {
  return Array.from({ length: 60 }, (_, i) => {
    const base = 0.012 + i * 0.000005;
    return [
      1700000000000 + i * 60000,
      base.toFixed(8),
      (base * 1.002).toFixed(8),
      (base * 0.998).toFixed(8),
      (base * 1.0005).toFixed(8),
      '1000',
      0,
      '12',
      10,
      '0',
      '0',
      '0',
    ] as KlineRaw;
  });
}

describe('formatSignificant', () => {
  it('mantiene decimales en precios pequenos', () => {
    expect(formatSignificant(0.0123456)).toBe('0.0123456');
  });

  it('recorta precios grandes sin ruido', () => {
    expect(formatSignificant(43250.123456)).toBe('43250.1');
  });

  it('soporta micro-caps', () => {
    expect(formatSignificant(0.000001234567)).toBe('0.00000123457');
  });
});

describe('buildTechnicalPrompt con precios pequenos', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(fetchKlines).mockResolvedValue(tinyPriceKlines());
  });

  it('no aplasta OHLC a 0.01', async () => {
    const prompt = await buildTechnicalPrompt('USUALUSDT');
    expect(prompt).not.toContain('O:0.01 ');
    expect(prompt).toContain('C:0.0123');
  });

  it('pide las 6 temporalidades', async () => {
    await buildTechnicalPrompt('BTCUSDT');
    const intervals = vi.mocked(fetchKlines).mock.calls.map((c) => c[1]);
    expect(intervals).toEqual(['5m', '15m', '1h', '2h', '4h', '1d']);
  });
});

describe('goChatCompletion', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('retorna el contenido cuando responde ok', async () => {
    const mockFetch = vi.fn().mockResolvedValue(fetchOk('respuesta'));
    vi.stubGlobal('fetch', mockFetch);

    const reply = await goChatCompletion([{ role: 'user', content: 'hola' }]);
    expect(reply).toBe('respuesta');
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('reintenta una vez en 503 y usa la segunda respuesta', async () => {
    const mockFetch = vi.fn()
      .mockResolvedValueOnce(fetchFail(503))
      .mockResolvedValueOnce(fetchOk('segunda'));
    vi.stubGlobal('fetch', mockFetch);

    const reply = await goChatCompletion([{ role: 'user', content: 'hola' }]);
    expect(reply).toBe('segunda');
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it('falla rapido en errores no recuperables (401)', async () => {
    const mockFetch = vi.fn().mockResolvedValue(fetchFail(401));
    vi.stubGlobal('fetch', mockFetch);

    await expect(
      goChatCompletion([{ role: 'user', content: 'hola' }]),
    ).rejects.toThrow('HTTP 401');
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('timeout no reintenta y da mensaje claro', async () => {
    const timeoutError = new Error('The operation was aborted due to timeout');
    timeoutError.name = 'TimeoutError';
    const mockFetch = vi.fn().mockRejectedValue(timeoutError);
    vi.stubGlobal('fetch', mockFetch);

    await expect(
      goChatCompletion([{ role: 'user', content: 'hola' }]),
    ).rejects.toThrow('tardo demasiado');
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });
});

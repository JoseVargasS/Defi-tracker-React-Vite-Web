import { describe, it, expect, vi, beforeEach } from 'vitest';
import { makeRequest } from '@/api/client';

beforeEach(() => {
  vi.restoreAllMocks();
});

describe('makeRequest', () => {
  it('returns JSON on success', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ data: 'test' }),
    });
    vi.stubGlobal('fetch', mockFetch);
    const result = await makeRequest('https://api.example.com/data');
    expect(result).toEqual({ data: 'test' });
  });

  it('returns null when JSON parsing fails', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.reject(new Error('bad json')),
    }));
    const result = await makeRequest('https://api.example.com/data');
    expect(result).toBeNull();
  });

  it('throws on non-ok response', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      statusText: 'Internal Server Error',
    }));
    await expect(makeRequest('https://api.example.com/data')).rejects.toThrow('HTTP 500');
  });

  it('retries once on 406', async () => {
    vi.useFakeTimers();
    let callCount = 0;
    vi.stubGlobal('fetch', vi.fn().mockImplementation(() => {
      callCount++;
      if (callCount === 1) {
        return Promise.resolve({
          ok: false,
          status: 406,
          statusText: 'Not Acceptable',
          headers: new Map([['Retry-After', '0']]),
        });
      }
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ retried: true }),
      });
    }));
    const resultPromise = makeRequest('https://api.example.com/data');
    await vi.advanceTimersByTimeAsync(3000);
    const result = await resultPromise;
    expect(result).toEqual({ retried: true });
    vi.useRealTimers();
  });

  it('retries once on 429', async () => {
    vi.useFakeTimers();
    let callCount = 0;
    vi.stubGlobal('fetch', vi.fn().mockImplementation(() => {
      callCount++;
      if (callCount === 1) {
        return Promise.resolve({
          ok: false,
          status: 429,
          statusText: 'Too Many Requests',
          headers: new Map([['Retry-After', '0']]),
        });
      }
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ retried: true }),
      });
    }));
    const resultPromise = makeRequest('https://api.example.com/data');
    await vi.advanceTimersByTimeAsync(3000);
    const result = await resultPromise;
    expect(result).toEqual({ retried: true });
    vi.useRealTimers();
  });

  it('throws on network error', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network fail')));
    await expect(makeRequest('https://api.example.com/data')).rejects.toThrow('network fail');
  });
});

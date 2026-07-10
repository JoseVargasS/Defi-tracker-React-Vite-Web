import { describe, it, expect } from 'vitest';
import {
  formatPrice,
  escapeHTML,
  safeImageUrl,
  safeErrorMessage,
  apiStatusMessage,
  mapWithConcurrency,
  tokenIconUrl,
  integerAmountToNumber,
} from '@/lib/utils';

describe('formatPrice', () => {
  it('returns "-" for NaN', () => {
    expect(formatPrice(NaN)).toBe('-');
    expect(formatPrice('not-a-number')).toBe('-');
  });

  it('returns 4 decimals for values < 1', () => {
    expect(formatPrice(0.12345)).toBe('0.1235');
    expect(formatPrice('0.5')).toBe('0.5000');
  });

  it('returns 2 decimals for values >= 1', () => {
    expect(formatPrice(1)).toBe('1.00');
    expect(formatPrice(123.456)).toBe('123.46');
    expect(formatPrice('99.9')).toBe('99.90');
  });
});

describe('escapeHTML', () => {
  it('escapes & < > " \'', () => {
    expect(escapeHTML('&<>"\'')).toBe('&amp;&lt;&gt;&quot;&#39;');
  });

  it('returns empty string for null/undefined', () => {
    expect(escapeHTML(null)).toBe('');
    expect(escapeHTML(undefined)).toBe('');
  });

  it('handles strings without special characters', () => {
    expect(escapeHTML('hello world')).toBe('hello world');
  });

  it('converts numbers to strings', () => {
    expect(escapeHTML(42)).toBe('42');
  });
});

describe('safeImageUrl', () => {
  it('returns fallback for empty value', () => {
    expect(safeImageUrl('', 'fallback.png')).toBe('fallback.png');
    expect(safeImageUrl('   ', 'fallback.png')).toBe('fallback.png');
  });

  it('accepts relative paths starting with ./ or /', () => {
    expect(safeImageUrl('./icon.png')).toBe('./icon.png');
    expect(safeImageUrl('/images/icon.png')).toBe('/images/icon.png');
  });

  it('accepts http and https URLs', () => {
    const url = 'https://example.com/icon.png';
    expect(safeImageUrl(url)).toBe(url);
    expect(safeImageUrl('http://example.com/icon.png')).toBe(
      'http://example.com/icon.png',
    );
  });

  it('rejects non-http(s) protocols', () => {
    expect(safeImageUrl('ftp://example.com/icon.png', 'fallback.png')).toBe(
      'fallback.png',
    );
    expect(safeImageUrl('javascript:alert(1)', 'fallback.png')).toBe(
      'fallback.png',
    );
  });

  it('rejects invalid URLs', () => {
    expect(safeImageUrl('not-a-url', 'fallback.png')).toBe('fallback.png');
  });

  it('accepts protocol-relative URLs by prepending https:', () => {
    expect(safeImageUrl('//example.com/icon.png')).toBe('https://example.com/icon.png');
  });
});

describe('safeErrorMessage', () => {
  it('returns fallback for very long messages (> 180 chars)', () => {
    const long = 'x'.repeat(200);
    expect(safeErrorMessage(long)).toBe('Ocurrio un error al cargar los datos.');
  });

  it('returns message for normal error strings', () => {
    expect(safeErrorMessage('something went wrong')).toBe('something went wrong');
  });

  it('returns fallback for empty message', () => {
    expect(safeErrorMessage('')).toBe('Ocurrio un error al cargar los datos.');
  });

  it('handles Error instances', () => {
    expect(safeErrorMessage(new Error('test error'))).toBe('test error');
  });

  it('returns fallback for messages with dangerous chars', () => {
    expect(safeErrorMessage('<script>alert(1)</script>')).toBe(
      'Ocurrio un error al cargar los datos.',
    );
  });
});

describe('apiStatusMessage', () => {
  it('returns correct message for 401', () => {
    const msg = apiStatusMessage(401);
    expect(msg).toContain('401');
    expect(msg).toContain('API key');
  });

  it('returns correct message for 406', () => {
    const msg = apiStatusMessage(406);
    expect(msg).toContain('406');
  });

  it('returns correct message for 409', () => {
    const msg = apiStatusMessage(409);
    expect(msg).toContain('sincronizando');
  });

  it('returns correct message for 429', () => {
    const msg = apiStatusMessage(429);
    expect(msg).toContain('429');
    expect(msg).toContain('limitando');
  });

  it('returns generic message for other status codes', () => {
    const msg = apiStatusMessage(500);
    expect(msg).toContain('No se pudo completar');
  });

  it('uses custom source name', () => {
    const msg = apiStatusMessage(401, 'Binance');
    expect(msg).toContain('Binance');
  });
});

describe('mapWithConcurrency', () => {
  it('limits concurrent execution', async () => {
    let concurrent = 0;
    let maxConcurrent = 0;

    const results = await mapWithConcurrency(
      [1, 2, 3, 4, 5],
      2,
      async (n) => {
        concurrent++;
        maxConcurrent = Math.max(maxConcurrent, concurrent);
        await new Promise((r) => setTimeout(r, 20));
        concurrent--;
        return n * 2;
      },
    );
    expect(maxConcurrent).toBeLessThanOrEqual(2);
    expect(results).toEqual([2, 4, 6, 8, 10]);
  });

  it('returns results in order', async () => {
    const results = await mapWithConcurrency(
      [3, 1, 2],
      2,
      async (n) => {
        await new Promise((r) => setTimeout(r, n * 10));
        return n;
      },
    );
    expect(results).toEqual([3, 1, 2]);
  });

  it('handles empty array', async () => {
    const results = await mapWithConcurrency([], 5, async (n) => n);
    expect(results).toEqual([]);
  });
});

describe('tokenIconUrl', () => {
  it('returns empty string for empty input', () => {
    expect(tokenIconUrl('')).toBe('');
    // @ts-expect-error testing null edge case
    expect(tokenIconUrl(null)).toBe('');
    // @ts-expect-error testing undefined edge case
    expect(tokenIconUrl(undefined)).toBe('');
  });

  it('returns fallback URL for known symbols', () => {
    const url = tokenIconUrl('ETH');
    expect(url).toBe('/images/Eth-icon-purple.png');
  });

  it('falls back to CDN for unknown symbols', () => {
    const url = tokenIconUrl('XYZ');
    expect(url).toContain('cdn.jsdelivr.net');
    expect(url).toContain('xyz.png');
  });

  it('normalizes to uppercase', () => {
    const url = tokenIconUrl('eth');
    expect(url).toBe('/images/Eth-icon-purple.png');
  });
});

describe('integerAmountToNumber', () => {
  it('converts small integer with 18 decimals', () => {
    const result = integerAmountToNumber('1000000000000000000', 18);
    expect(result).toBeCloseTo(1.0);
  });

  it('returns 0 for empty/zero input', () => {
    expect(integerAmountToNumber('', 18)).toBe(0);
    expect(integerAmountToNumber('0', 18)).toBe(0);
  });

  it('handles decimal input directly', () => {
    expect(integerAmountToNumber('1.5', 18)).toBe(1.5);
  });

  it('handles non-numeric strings', () => {
    expect(integerAmountToNumber('abc', 18)).toBe(0);
  });

  it('handles large numbers with BigInt path', () => {
    const big = '123456789012345678901234567890';
    const result = integerAmountToNumber(big, 18);
    expect(result).toBeGreaterThan(0);
  });

  it('handles non-finite decimals parameter', () => {
    const result = integerAmountToNumber('100', NaN);
    expect(result).toBe(100 / Math.pow(10, 18));
  });
});

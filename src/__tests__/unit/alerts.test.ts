import { describe, it, expect, vi } from 'vitest';
import {
  buildConfluence,
  confluenceMessage,
  divId,
  divMessage,
  divTag,
  kindLabelEs,
  scanPairDivergences,
  tfDurationMs,
} from '@/lib/alerts';
import type { RsiDiv } from '@/lib/chart/rsiDiv';

function klines(n: number, closes: number[]): unknown[][] {
  return closes.slice(0, n).map((c, i) => [
    (i + 1) * 300_000, c - 1, c + 1, c - 2, c, 100, (i + 1) * 300_000, 10000, 1, 50, 5000, 0,
  ]);
}

describe('alert helpers', () => {
  it('builds stable ids, tags and messages', () => {
    expect(divId('BTC_USDT', '5m', 'REG_BULL', 123)).toBe('BTC_USDT|5m|REG_BULL|123');
    expect(divTag(true, true)).toBe('Pre-Bull');
    expect(divTag(false, false)).toBe('Bear');
    expect(divMessage('BTC_USDT', '5m', false, true)).toBe('¡Bull en 5m en BTCUSDT!');
    expect(kindLabelEs('REG_BULL')).toBe('Alcista regular');
    expect(kindLabelEs('CONF_BEAR')).toContain('bajista');
  });

  it('maps tf durations', () => {
    expect(tfDurationMs('1h')).toBe(3_600_000);
    expect(tfDurationMs('nope')).toBe(0);
  });

  it('builds confluence only with 2+ TFs same direction', () => {
    const div = (kind: RsiDiv['kind']): RsiDiv => ({ idx1: 1, idx2: 70, rsi1: 30, rsi2: 35, kind });
    expect(
      buildConfluence('BTC_USDT', [
        { interval: '5m', div: div('REG_BULL'), candleTime: 1 },
        { interval: '15m', div: div('HID_BULL'), candleTime: 2 },
      ])?.intervals,
    ).toEqual(['5m', '15m']);
    expect(
      buildConfluence('BTC_USDT', [{ interval: '5m', div: div('REG_BULL'), candleTime: 1 }]),
    ).toBeNull();
    expect(confluenceMessage('BTC_USDT', true, ['5m', '15m'])).toContain('5m+15m');
  });
});

describe('scanPairDivergences', () => {
  it('returns no candidates on flat candles', async () => {
    const flat = Array.from({ length: 100 }, () => 100);
    const { candidates, fresh } = await scanPairDivergences('BTC_USDT', ['5m'], async () => klines(100, flat));
    expect(candidates).toEqual([]);
    expect(fresh).toEqual([]);
  });

  it('skips short histories', async () => {
    const fetch = vi.fn(async () => klines(10, Array.from({ length: 10 }, (_, i) => 100 + i)));
    const { candidates } = await scanPairDivergences('BTC_USDT', ['5m'], fetch);
    expect(candidates).toEqual([]);
  });

  it('detects fresh divergences on oscillating candles', async () => {
    const closes = Array.from({ length: 100 }, (_, i) => 100 + Math.sin(i / 4) * 8 - i * 0.12);
    const { candidates } = await scanPairDivergences('BTC_USDT', ['5m'], async () => klines(100, closes));
    for (const c of candidates) {
      expect(c.symbol).toBe('BTC_USDT');
      expect(c.interval).toBe('5m');
    }
  });
});

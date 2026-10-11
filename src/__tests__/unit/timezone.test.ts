import { describe, it, expect } from 'vitest';
import {
  formatClockInZone,
  formatCrosshairInZone,
  formatTickInZone,
  zoneOffsetLabel,
  zoneShortName,
} from '@/lib/chart/timezone';

// 2026-01-15T12:00:00Z: Lima sin DST (UTC-5 todo el año).
const NOON_UTC = Date.UTC(2026, 0, 15, 12, 0, 0);

describe('chart timezone formatting', () => {
  it('formats intraday ticks in the chosen zone', () => {
    expect(formatTickInZone(NOON_UTC / 1000, 'time', 'America/Lima')).toBe('07:00');
    expect(formatTickInZone(NOON_UTC / 1000, 'time', 'UTC')).toBe('12:00');
  });

  it('formats day/month/year ticks without crashing', () => {
    expect(formatTickInZone(NOON_UTC / 1000, 'day', 'America/Lima')).toContain('15');
    expect(formatTickInZone(NOON_UTC / 1000, 'year', 'UTC')).toContain('2026');
    expect(formatTickInZone(NOON_UTC / 1000, 'month', 'UTC')).toBeTruthy();
  });

  it('formats crosshair and clock labels', () => {
    expect(formatCrosshairInZone(NOON_UTC / 1000, 'America/Lima')).toContain('07:00');
    expect(formatClockInZone(NOON_UTC, 'America/Lima')).toContain('07:00:00');
  });

  it('labels Lima as UTC-5 like TradingView', () => {
    expect(zoneOffsetLabel('America/Lima', NOON_UTC)).toBe('UTC-5');
    expect(zoneOffsetLabel('UTC', NOON_UTC)).toBe('UTC');
  });

  it('shortens zone names for the selector', () => {
    expect(zoneShortName('America/New_York')).toBe('New York');
    expect(zoneShortName('UTC')).toBe('UTC');
  });
});

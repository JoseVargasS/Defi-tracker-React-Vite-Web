import { describe, it, expect, beforeEach } from 'vitest';
import { useAlertsStore } from '@/store/useAlertsStore';
import type { DivCandidate } from '@/lib/alerts';

function candidate(over: Partial<DivCandidate> = {}): DivCandidate {
  return {
    symbol: 'BTC_USDT',
    interval: '5m',
    div: { idx1: 60, idx2: 75, rsi1: 30, rsi2: 35, kind: 'REG_BULL' },
    candleTime: 75 * 300_000,
    pre: true,
    ...over,
  };
}

beforeEach(() => {
  localStorage.clear();
  useAlertsStore.setState({
    alerts: [],
    monitorEnabled: true,
    monitorIntervals: ['5m', '15m', '30m', '1h'],
    confluenceEnabled: true,
  });
});

describe('useAlertsStore ingest', () => {
  it('creates PRE rows', () => {
    useAlertsStore.getState().ingestCandidate(candidate());
    const [a] = useAlertsStore.getState().alerts;
    expect(a?.status).toBe('PRE');
    expect(a?.message).toContain('Pre-Bull');
    expect(a?.seen).toBe(false);
  });

  it('ignores duplicate PRE ids', () => {
    useAlertsStore.getState().ingestCandidate(candidate());
    useAlertsStore.getState().ingestCandidate(candidate());
    expect(useAlertsStore.getState().alerts).toHaveLength(1);
  });

  it('upgrades PRE to CONFIRMED on confirmed candidate', () => {
    useAlertsStore.getState().ingestCandidate(candidate());
    useAlertsStore.getState().ingestCandidate(candidate({ pre: false }));
    const [a] = useAlertsStore.getState().alerts;
    expect(useAlertsStore.getState().alerts).toHaveLength(1);
    expect(a?.status).toBe('CONFIRMED');
    expect(a?.message).toContain('¡Bull en 5m');
  });

  it('creates CONFIRMED directly when no PRE exists', () => {
    useAlertsStore.getState().ingestCandidate(candidate({ pre: false }));
    expect(useAlertsStore.getState().alerts[0]?.status).toBe('CONFIRMED');
  });

  it('applies confluence cooldown', () => {
    const conf = { symbol: 'BTC_USDT', interval: '15m', bullish: true, candleTime: 999, intervals: ['5m', '15m'] };
    useAlertsStore.getState().ingestConfluence(conf);
    useAlertsStore.getState().ingestConfluence({ ...conf, candleTime: 1000 });
    const confs = useAlertsStore.getState().alerts.filter((a) => a.kind === 'CONF_BULL');
    expect(confs).toHaveLength(1);
  });
});

describe('useAlertsStore signals', () => {
  it('ingests signals with cooldown', () => {
    const store = useAlertsStore.getState();
    store.ingestSignal('BTC_USDT', '5m', { kind: 'SWEEP_BULL', bullish: true, label: 'Barrido' }, 111);
    store.ingestSignal('BTC_USDT', '5m', { kind: 'SWEEP_BULL', bullish: true, label: 'Barrido' }, 222);
    const sweeps = useAlertsStore.getState().alerts.filter((a) => a.kind === 'SWEEP_BULL');
    expect(sweeps).toHaveLength(1);
    expect(sweeps[0]?.message).toContain('Barrido');
  });

  it('counts since timestamp', () => {
    useAlertsStore.getState().ingestSignal('BTC_USDT', '5m', { kind: 'SWEEP_BULL', bullish: true, label: 'Barrido' }, 111);
    expect(useAlertsStore.getState().countSince('BTC_USDT', 'SWEEP_BULL', Date.now() - 1000)).toBe(1);
    expect(useAlertsStore.getState().countSince('BTC_USDT', 'SWEEP_BULL', Date.now() + 1000)).toBe(0);
  });

  it('toggles monitor signals', () => {
    useAlertsStore.getState().toggleMonitorSignal('SWEEP');
    expect(useAlertsStore.getState().monitorSignals).not.toContain('SWEEP');
    useAlertsStore.getState().toggleMonitorSignal('SWEEP');
    expect(useAlertsStore.getState().monitorSignals).toContain('SWEEP');
  });
});

describe('useAlertsStore seen/clear', () => {
  it('marks seen and counts unread', () => {
    useAlertsStore.getState().ingestCandidate(candidate());
    expect(useAlertsStore.getState().unreadCount()).toBe(1);
    useAlertsStore.getState().markAllSeen();
    expect(useAlertsStore.getState().unreadCount()).toBe(0);
  });

  it('clears all', () => {
    useAlertsStore.getState().ingestCandidate(candidate());
    useAlertsStore.getState().clearAll();
    expect(useAlertsStore.getState().alerts).toEqual([]);
  });

  it('toggles monitor intervals keeping at least one', () => {
    useAlertsStore.getState().toggleMonitorInterval('5m');
    expect(useAlertsStore.getState().monitorIntervals).not.toContain('5m');
    for (const iv of [...useAlertsStore.getState().monitorIntervals]) {
      useAlertsStore.getState().toggleMonitorInterval(iv);
    }
    expect(useAlertsStore.getState().monitorIntervals.length).toBe(1);
  });
});

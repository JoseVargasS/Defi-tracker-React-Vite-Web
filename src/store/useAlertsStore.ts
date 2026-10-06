import { create } from 'zustand';
import {
  CONF_COOLDOWN_MS,
  MAX_ALERTS,
  PRUNE_MS,
  SIGNAL_COOLDOWN_MS,
  confluenceMessage,
  divId,
  divMessage,
  tfDurationMs,
  type ConfluenceCandidate,
  type DivAlert,
  type DivCandidate,
} from '@/lib/alerts';
import type { TradeSignal } from '@/lib/chart/signals';
import { readDivAlerts, readDivMonitor, writeDivAlerts, writeDivMonitor } from '@/lib/storage';

function nearby(alerts: DivAlert[], symbol: string, interval: string, kind: string, candleTime: number, status: DivAlert['status']): DivAlert | null {
  const step = tfDurationMs(interval);
  if (step <= 0) return null;
  const span = 2 * step;
  const matches = alerts.filter(
    (a) =>
      a.symbol === symbol &&
      a.interval === interval &&
      a.kind === kind &&
      a.status === status &&
      Math.abs(a.candleTime - candleTime) <= span,
  );
  matches.sort((a, b) => b.candleTime - a.candleTime);
  return matches[0] ?? null;
}

interface AlertsState {
  alerts: DivAlert[];
  monitorEnabled: boolean;
  monitorIntervals: string[];
  confluenceEnabled: boolean;
  monitorSignals: string[];

  ingestCandidate: (candidate: DivCandidate) => void;
  ingestConfluence: (candidate: ConfluenceCandidate) => void;
  ingestSignal: (symbol: string, interval: string, signal: TradeSignal, candleTime: number) => void;
  countSince: (symbol: string, kind: string, sinceMs: number) => number;
  markSeen: (id: string) => void;
  markAllSeen: () => void;
  clearAll: () => void;
  setMonitorEnabled: (enabled: boolean) => void;
  toggleMonitorInterval: (interval: string) => void;
  setConfluenceEnabled: (enabled: boolean) => void;
  toggleMonitorSignal: (group: string) => void;
  unreadCount: () => number;
}

function persist(alerts: DivAlert[]): DivAlert[] {
  const pruned = alerts
    .filter((a) => Date.now() - a.createdAt <= PRUNE_MS)
    .sort((a, b) => b.createdAt - a.createdAt)
    .slice(0, MAX_ALERTS);
  writeDivAlerts(pruned);
  return pruned;
}

export const useAlertsStore = create<AlertsState>((set, get) => ({
  alerts: persist(readDivAlerts()),
  monitorEnabled: readDivMonitor().enabled,
  monitorIntervals: readDivMonitor().intervals,
  confluenceEnabled: readDivMonitor().confluence,
  monitorSignals: readDivMonitor().signals,

  ingestCandidate: (candidate) =>
    set((state) => {
      const { symbol, interval, div, candleTime, pre } = candidate;
      const now = Date.now();
      const id = divId(symbol, interval, div.kind, candleTime);
      const byId = new Map(state.alerts.map((a) => [a.id, a]));
      // La pre crea la fila y la confirmada la actualiza a Bull/Bear.
      if (pre) {
        if (byId.has(id)) return state;
        if (nearby(state.alerts, symbol, interval, div.kind, candleTime, 'CONFIRMED')) return state;
        const alert: DivAlert = {
          id,
          symbol,
          source: 'MEXC',
          interval,
          kind: div.kind,
          bullish: div.kind === 'REG_BULL' || div.kind === 'HID_BULL',
          message: divMessage(symbol, interval, true, div.kind === 'REG_BULL' || div.kind === 'HID_BULL'),
          createdAt: now,
          candleTime,
          seen: false,
          status: 'PRE',
        };
        return { alerts: persist([alert, ...state.alerts]) };
      }
      const bullish = div.kind === 'REG_BULL' || div.kind === 'HID_BULL';
      const message = divMessage(symbol, interval, false, bullish);
      const existing = byId.get(id);
      if (existing) {
        if (existing.status === 'CONFIRMED') return state;
        const upgraded = state.alerts.map((a) =>
          a.id === id ? { ...a, status: 'CONFIRMED' as const, message, candleTime, createdAt: now, seen: false } : a,
        );
        return { alerts: persist(upgraded) };
      }
      const match = nearby(state.alerts, symbol, interval, div.kind, candleTime, 'PRE');
      if (match) {
        const upgraded = state.alerts.map((a) =>
          a.id === match.id ? { ...a, status: 'CONFIRMED' as const, message, candleTime, createdAt: now, seen: false } : a,
        );
        return { alerts: persist(upgraded) };
      }
      const alert: DivAlert = {
        id, symbol, source: 'MEXC', interval, kind: div.kind, bullish, message,
        createdAt: now, candleTime, seen: false, status: 'CONFIRMED',
      };
      return { alerts: persist([alert, ...state.alerts]) };
    }),

  ingestConfluence: (candidate) =>
    set((state) => {
      if (!get().confluenceEnabled) return state;
      const now = Date.now();
      const kind = candidate.bullish ? 'CONF_BULL' : 'CONF_BEAR';
      const recent = state.alerts.filter(
        (a) => a.symbol === candidate.symbol && a.kind === kind && now - a.createdAt <= CONF_COOLDOWN_MS,
      );
      if (recent.length > 0) return state;
      const id = `${candidate.symbol}|CONF|${candidate.bullish ? 'BULL' : 'BEAR'}|${candidate.candleTime}`;
      if (state.alerts.some((a) => a.id === id)) return state;
      const alert: DivAlert = {
        id,
        symbol: candidate.symbol,
        source: 'MEXC',
        interval: candidate.interval,
        kind,
        bullish: candidate.bullish,
        message: confluenceMessage(candidate.symbol, candidate.bullish, candidate.intervals),
        createdAt: now,
        candleTime: candidate.candleTime,
        seen: false,
        status: 'CONFIRMED',
      };
      return { alerts: persist([alert, ...state.alerts]) };
    }),

  ingestSignal: (symbol, interval, signal, candleTime) =>
    set((state) => {
      const now = Date.now();
      const recent = state.alerts.filter(
        (a) => a.symbol === symbol && a.kind === signal.kind && now - a.createdAt <= SIGNAL_COOLDOWN_MS,
      );
      if (recent.length > 0) return state;
      const id = `${symbol}|${interval}|${signal.kind}|${candleTime}`;
      if (state.alerts.some((a) => a.id === id)) return state;
      const display = symbol.replace(/_/g, '');
      const alert: DivAlert = {
        id,
        symbol,
        source: 'MEXC',
        interval,
        kind: signal.kind,
        bullish: signal.bullish,
        message: `¡Señal ${signal.label} ${signal.bullish ? 'alcista' : 'bajista'} en ${interval} en ${display}!`,
        createdAt: now,
        candleTime,
        seen: false,
        status: 'CONFIRMED',
      };
      return { alerts: persist([alert, ...state.alerts]) };
    }),

  countSince: (symbol, kind, sinceMs) =>
    get().alerts.filter((a) => a.symbol === symbol && a.kind === kind && a.createdAt > sinceMs).length,

  markSeen: (id) =>
    set((state) => {
      const next = state.alerts.map((a) => (a.id === id ? { ...a, seen: true } : a));
      writeDivAlerts(next);
      return { alerts: next };
    }),

  markAllSeen: () =>
    set((state) => {
      const next = state.alerts.map((a) => ({ ...a, seen: true }));
      writeDivAlerts(next);
      return { alerts: next };
    }),

  clearAll: () =>
    set(() => {
      writeDivAlerts([]);
      return { alerts: [] };
    }),

  setMonitorEnabled: (enabled) =>
    set((state) => {
      writeDivMonitor({ enabled, intervals: state.monitorIntervals, confluence: state.confluenceEnabled, signals: state.monitorSignals });
      return { monitorEnabled: enabled };
    }),

  toggleMonitorInterval: (interval) =>
    set((state) => {
      const next = state.monitorIntervals.includes(interval)
        ? state.monitorIntervals.filter((i) => i !== interval)
        : [...state.monitorIntervals, interval];
      if (!next.length) return state;
      writeDivMonitor({ enabled: state.monitorEnabled, intervals: next, confluence: state.confluenceEnabled, signals: state.monitorSignals });
      return { monitorIntervals: next };
    }),

  setConfluenceEnabled: (enabled) =>
    set((state) => {
      writeDivMonitor({ enabled: state.monitorEnabled, intervals: state.monitorIntervals, confluence: enabled, signals: state.monitorSignals });
      return { confluenceEnabled: enabled };
    }),

  toggleMonitorSignal: (group) =>
    set((state) => {
      const next = state.monitorSignals.includes(group)
        ? state.monitorSignals.filter((g) => g !== group)
        : [...state.monitorSignals, group];
      writeDivMonitor({ enabled: state.monitorEnabled, intervals: state.monitorIntervals, confluence: state.confluenceEnabled, signals: next });
      return { monitorSignals: next };
    }),

  unreadCount: () => get().alerts.filter((a) => !a.seen).length,
}));

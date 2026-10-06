import { useCallback, useEffect, useRef, useState } from 'react';
import { useAlertsStore } from '@/store/useAlertsStore';
import { useMarketStore } from '@/store/useMarketStore';
import {
  MIN_SIGNAL_CANDLES,
  SCAN_INTERVAL_MS,
  SIGNAL_GROUPS,
  buildConfluence,
  kindLabelEs,
  scanPairDivergences,
} from '@/lib/alerts';
import { detectSignals } from '@/lib/chart/signals';
import { CHART_INTERVALS, formatTrackedPair, parseTrackedPair } from '@/lib/config';

function timeAgo(ts: number): string {
  const mins = Math.max(0, Math.round((Date.now() - ts) / 60_000));
  if (mins < 1) return 'ahora';
  if (mins < 60) return `hace ${mins} min`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `hace ${hours} h`;
  return `hace ${Math.round(hours / 24)} d`;
}

export function AlertsWidget() {
  const [open, setOpen] = useState(false);
  const alerts = useAlertsStore((s) => s.alerts);
  const unread = useAlertsStore((s) => s.alerts.filter((a) => !a.seen).length);
  const monitorEnabled = useAlertsStore((s) => s.monitorEnabled);
  const monitorIntervals = useAlertsStore((s) => s.monitorIntervals);
  const confluenceEnabled = useAlertsStore((s) => s.confluenceEnabled);
  const markSeen = useAlertsStore((s) => s.markSeen);
  const markAllSeen = useAlertsStore((s) => s.markAllSeen);
  const clearAll = useAlertsStore((s) => s.clearAll);
  const setMonitorEnabled = useAlertsStore((s) => s.setMonitorEnabled);
  const toggleMonitorInterval = useAlertsStore((s) => s.toggleMonitorInterval);
  const setConfluenceEnabled = useAlertsStore((s) => s.setConfluenceEnabled);
  const monitorSignals = useAlertsStore((s) => s.monitorSignals);
  const toggleMonitorSignal = useAlertsStore((s) => s.toggleMonitorSignal);
  const tracked = useMarketStore((s) => s.tracked);
  const setCurrentPair = useMarketStore((s) => s.setCurrentPair);
  const setCurrentInterval = useMarketStore((s) => s.setCurrentInterval);
  const running = useRef(false);

  // Escaneo cada 60s con la tab abierta (sin push en web).
  const scan = useCallback(async () => {
    if (running.current) return;
    const state = useAlertsStore.getState();
    if (!state.monitorEnabled || !state.monitorIntervals.length) return;
    const pairs = useMarketStore.getState().tracked
      .map((e) => parseTrackedPair(e))
      .filter((p) => p.source === 'MEXC');
    if (!pairs.length) return;
    running.current = true;
    try {
      for (const pair of pairs) {
        const { candidates, fresh, byInterval } = await scanPairDivergences(pair.symbol, [...state.monitorIntervals]);
        for (const c of candidates) useAlertsStore.getState().ingestCandidate(c);
        if (state.confluenceEnabled) {
          const conf = buildConfluence(pair.symbol, fresh);
          if (conf) useAlertsStore.getState().ingestConfluence(conf);
        }
        if (state.monitorSignals.length) {
          for (const [interval, candles] of byInterval) {
            if (candles.length < MIN_SIGNAL_CANDLES) continue;
            for (const sig of detectSignals(candles)) {
              const group = sig.kind.split('_').slice(0, 2).join('_');
              if (!state.monitorSignals.includes(group)) continue;
              useAlertsStore.getState().ingestSignal(
                pair.symbol, interval, sig, candles[candles.length - 2]?.time ?? Date.now(),
              );
            }
          }
        }
      }
    } finally {
      running.current = false;
    }
  }, []);

  useEffect(() => {
    if (!monitorEnabled) return;
    scan().catch(() => {
      // el proximo ciclo reintenta
    });
    const id = setInterval(() => {
      scan().catch(() => {
        // el proximo ciclo reintenta
      });
    }, SCAN_INTERVAL_MS);
    return () => clearInterval(id);
  }, [monitorEnabled, monitorIntervals, tracked, scan]);

  const openAlert = useCallback((id: string, symbol: string, interval: string) => {
    markSeen(id);
    setCurrentPair(formatTrackedPair(symbol, 'MEXC'));
    setCurrentInterval(interval);
    setOpen(false);
  }, [markSeen, setCurrentPair, setCurrentInterval]);

  return (
    <>
      <button
        type="button"
        className="alerts-bell"
        onClick={() => setOpen((v) => !v)}
        title="Alertas de divergencias"
        aria-label="Abrir alertas"
      >
        🔔
        {unread > 0 && <span className="alerts-badge">{unread > 99 ? '99+' : unread}</span>}
      </button>
      {open && (
        <div className="alerts-overlay" onClick={() => setOpen(false)}>
          <div className="alerts-panel" role="dialog" aria-label="Alertas" onClick={(e) => e.stopPropagation()}>
            <div className="alerts-header">
              <strong>Alertas {unread > 0 && `(${unread} nuevas)`}</strong>
              <button type="button" className="ma-modal-close" onClick={() => setOpen(false)}>✕</button>
            </div>
            <div className="alerts-controls">
              <label className="alerts-toggle">
                <input
                  type="checkbox"
                  checked={monitorEnabled}
                  onChange={() => setMonitorEnabled(!monitorEnabled)}
                />
                {monitorEnabled ? 'Vigilando' : 'Pausado'}
              </label>
              <label className="alerts-toggle">
                <input
                  type="checkbox"
                  checked={confluenceEnabled}
                  onChange={() => setConfluenceEnabled(!confluenceEnabled)}
                />
                Doble confirmación
              </label>
              <button type="button" className="alerts-link" onClick={markAllSeen}>Marcar vistas</button>
              <button type="button" className="alerts-link danger" onClick={clearAll}>Borrar</button>
            </div>
            <div className="alerts-chips">
              {CHART_INTERVALS.map((iv) => (
                <button
                  key={iv.key}
                  type="button"
                  className={`alerts-chip${monitorIntervals.includes(iv.key) ? ' active' : ''}`}
                  onClick={() => toggleMonitorInterval(iv.key)}
                >
                  {iv.label}
                </button>
              ))}
            </div>
            <div className="alerts-chips">
              {SIGNAL_GROUPS.map((g) => (
                <button
                  key={g}
                  type="button"
                  className={`alerts-chip${monitorSignals.includes(g) ? ' active' : ''}`}
                  onClick={() => toggleMonitorSignal(g)}
                >
                  {g === 'MA_REJECT' ? 'Mechazo' : g === 'FVG_TAP' ? 'FVG' : 'Barrido'}
                </button>
              ))}
            </div>
            <div className="alerts-list">
              {alerts.length === 0 && <p className="alerts-empty">Sin alertas. Vigila pares MEXC y aparecen aquí.</p>}
              {alerts.map((a) => (
                <button
                  key={a.id}
                  type="button"
                  className={`alert-row${a.seen ? '' : ' unread'}`}
                  onClick={() => openAlert(a.id, a.symbol, a.interval)}
                >
                  <span className={`alert-arrow ${a.bullish ? 'up' : 'down'}`}>
                    {a.bullish ? '▲' : '▼'}
                  </span>
                  <span className="alert-body">
                    <span className="alert-msg">{a.message}</span>
                    <span className="alert-meta">
                      {kindLabelEs(a.kind)} · {a.interval}{a.status === 'PRE' ? ' · temprana' : ''} · {timeAgo(a.createdAt)}
                      {!a.seen && ' · nuevo'}
                    </span>
                  </span>
                </button>
              ))}
            </div>
            <p className="alerts-note">Solo pares MEXC · escaneo cada 60s con la web abierta · sin notificaciones push</p>
          </div>
        </div>
      )}
    </>
  );
}

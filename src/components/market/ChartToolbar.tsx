import { useEffect, useRef, useState } from 'react';
import { useMarketStore } from '@/store/useMarketStore';
import { CHART_INTERVALS } from '@/lib/config';
import type { ChartHandle } from '@/components/market/CandlestickChart';
import type { DrawTool, MaLineConfig, SmcToggles } from '@/lib/chart/types';
import { drawKindLabel, isDrawKind, type DrawKind } from '@/lib/chart/draw';
import { loadDrawOverlays, loadFibOverlays, saveDrawOverlays, saveFibOverlays } from '@/lib/chart/overlays';
import { PulsePanel } from '@/components/market/PulsePanel';

interface ChartToolbarProps {
  chartRef: React.RefObject<ChartHandle | null>;
  measureActive: boolean;
  onMeasureActiveChange: (active: boolean) => void;
  onResetChart: () => void;
}

// ponytail: 12 buttons for the most-used intervals, all others in a select
const BUTTON_INTERVAL_KEYS = ['1m', '5m', '15m', '1h', '4h', '12h', '1d', '5d', '1w', '2w', '1mo', '1M'];
const BUTTON_INTERVALS = CHART_INTERVALS.filter((iv) => BUTTON_INTERVAL_KEYS.includes(iv.key));
const SELECT_INTERVALS = CHART_INTERVALS.map((iv) => iv.key).filter(
  (key) => !BUTTON_INTERVAL_KEYS.includes(key),
);

interface MaModalProps {
  title: string;
  lines: MaLineConfig[];
  onUpdate: (id: string, updates: Partial<Omit<MaLineConfig, 'id'>>) => void;
  onAdd: () => void;
  onRemove: (id: string) => void;
  onClose: () => void;
}

function MaModal({ title, lines, onUpdate, onAdd, onRemove, onClose }: MaModalProps) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        onClose();
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [onClose]);

  return (
    <div className="ma-modal-overlay">
      <div className="ma-modal" ref={ref}>
        <div className="ma-modal-header">
          <span>{title}</span>
          <button type="button" className="ma-modal-close" onClick={onClose}>✕</button>
        </div>
        <div className="ma-modal-body">
          {lines.map((line) => (
            <div className="ma-modal-row" key={line.id}>
              <label className="ma-modal-check">
                <input
                  type="checkbox"
                  checked={line.enabled}
                  onChange={() => onUpdate(line.id, { enabled: !line.enabled })}
                />
              </label>
              <select
                className="ma-modal-select"
                value={line.kind ?? (title === 'EMA' ? 'EMA' : 'SMA')}
                onChange={(e) => onUpdate(line.id, { kind: e.target.value as MaLineConfig['kind'] })}
                aria-label="Tipo de media"
              >
                <option value="SMA">SMA</option>
                <option value="EMA">EMA</option>
              </select>
              <span className="ma-modal-label">Period</span>
              <input
                type="number"
                className="ma-modal-input"
                min={2}
                max={500}
                value={line.period}
                onChange={(e) => {
                  const v = parseInt(e.target.value, 10);
                  if (v >= 2 && v <= 500) onUpdate(line.id, { period: v });
                }}
              />
              <select
                className="ma-modal-select"
                value={line.timeframe ?? 'chart'}
                onChange={(e) => onUpdate(line.id, { timeframe: e.target.value })}
                aria-label="Temporalidad de la media"
              >
                <option value="chart">Chart</option>
                {CHART_INTERVALS.map((iv) => (
                  <option key={iv.key} value={iv.key}>{iv.label}</option>
                ))}
              </select>
              <input
                type="color"
                className="ma-modal-color"
                value={line.color}
                onChange={(e) => onUpdate(line.id, { color: e.target.value, customColor: true })}
              />
              <button
                type="button"
                className="ma-modal-remove"
                onClick={() => onRemove(line.id)}
                title="Remove"
              >
                ✕
              </button>
            </div>
          ))}
        </div>
        <div className="ma-modal-footer">
          <button type="button" className="ma-modal-add" onClick={onAdd}>+ Add {title}</button>
        </div>
      </div>
    </div>
  );
}

const SMC_ROWS: { key: keyof SmcToggles; label: string }[] = [
  { key: 'swings', label: 'Swings' },
  { key: 'structure', label: 'BOS/CHoCH' },
  { key: 'zones', label: 'OB + FVG' },
  { key: 'premium', label: 'Premium' },
  { key: 'eq', label: 'EQH/EQL' },
  { key: 'liquidity', label: 'Liquidez' },
  { key: 'confluence', label: 'Confluencia HTF' },
];

const DRAW_KINDS: DrawKind[] = [
  'SEGMENT', 'LINE', 'RAY', 'ARROW', 'H_SEGMENT', 'H_LINE', 'H_RAY',
  'RECT', 'CIRCLE', 'TRIANGLE', 'PRICE_LINE',
];

function FibDrawModal({ symbol, onClose }: { symbol: string | null; onClose: () => void }) {
  const bumpOverlays = useMarketStore((s) => s.bumpOverlays);
  const [tick, setTick] = useState(0);
  const fibs = symbol ? loadFibOverlays(symbol) : [];
  const draws = symbol ? loadDrawOverlays(symbol) : [];
  const refresh = () => setTick((t) => t + 1);
  void tick;

  const updateFib = (id: string, updates: { hidden?: boolean }) => {
    if (!symbol) return;
    saveFibOverlays(symbol, loadFibOverlays(symbol).map((f) => (f.id === id ? { ...f, ...updates } : f)));
    bumpOverlays();
    refresh();
  };
  const removeFib = (id: string) => {
    if (!symbol) return;
    saveFibOverlays(symbol, loadFibOverlays(symbol).filter((f) => f.id !== id));
    bumpOverlays();
    refresh();
  };
  const updateDraw = (id: string, updates: { hidden?: boolean }) => {
    if (!symbol) return;
    saveDrawOverlays(symbol, loadDrawOverlays(symbol).map((d) => (d.id === id ? { ...d, ...updates } : d)));
    bumpOverlays();
    refresh();
  };
  const removeDraw = (id: string) => {
    if (!symbol) return;
    saveDrawOverlays(symbol, loadDrawOverlays(symbol).filter((d) => d.id !== id));
    bumpOverlays();
    refresh();
  };
  const clearAll = () => {
    if (!symbol) return;
    saveFibOverlays(symbol, []);
    saveDrawOverlays(symbol, []);
    bumpOverlays();
    refresh();
  };

  return (
    <div className="ma-modal-overlay">
      <div className="ma-modal" role="dialog" aria-label="Dibujos">
        <div className="ma-modal-header">
          <span>Dibujos ({fibs.length + draws.length})</span>
          <button type="button" className="ma-modal-close" onClick={onClose}>✕</button>
        </div>
        <div className="ma-modal-body">
          {fibs.map((f) => (
            <div className="ma-modal-row" key={f.id}>
              <label className="ma-modal-check">
                <input type="checkbox" checked={!f.hidden} onChange={() => updateFib(f.id, { hidden: !f.hidden })} />
              </label>
              <span className="ma-modal-label">Fibo {f.enabledLevels.length} niveles</span>
              <button type="button" className="ma-modal-remove" onClick={() => removeFib(f.id)} title="Eliminar">✕</button>
            </div>
          ))}
          {draws.map((d) => (
            <div className="ma-modal-row" key={d.id}>
              <label className="ma-modal-check">
                <input type="checkbox" checked={!d.hidden} onChange={() => updateDraw(d.id, { hidden: !d.hidden })} />
              </label>
              <span className="ma-modal-label">{drawKindLabel(d.kind)}{d.locked ? ' · 🔒' : ''}</span>
              <button type="button" className="ma-modal-remove" onClick={() => removeDraw(d.id)} title="Eliminar">✕</button>
            </div>
          ))}
          {fibs.length + draws.length === 0 && <p className="alerts-empty">Sin dibujos en este par.</p>}
        </div>
        <div className="ma-modal-footer">
          <button type="button" className="ma-modal-add" onClick={clearAll}>Limpiar todo</button>
        </div>
      </div>
    </div>
  );
}

export function ChartToolbar({ chartRef, measureActive, onMeasureActiveChange, onResetChart }: ChartToolbarProps) {
  const chartMode = useMarketStore((s) => s.chartMode);
  const setChartMode = useMarketStore((s) => s.setChartMode);
  const currentInterval = useMarketStore((s) => s.currentInterval);
  const setCurrentInterval = useMarketStore((s) => s.setCurrentInterval);
  const chartIndicators = useMarketStore((s) => s.chartIndicators);
  const setChartIndicator = useMarketStore((s) => s.setChartIndicator);
  const setSmaLine = useMarketStore((s) => s.setSmaLine);
  const addSmaLine = useMarketStore((s) => s.addSmaLine);
  const removeSmaLine = useMarketStore((s) => s.removeSmaLine);
  const setEmaLine = useMarketStore((s) => s.setEmaLine);
  const addEmaLine = useMarketStore((s) => s.addEmaLine);
  const removeEmaLine = useMarketStore((s) => s.removeEmaLine);
  const setRsiEnabled = useMarketStore((s) => s.setRsiEnabled);
  const setRsiPeriod = useMarketStore((s) => s.setRsiPeriod);
  const setIndicatorColor = useMarketStore((s) => s.setIndicatorColor);
  const setSmcToggle = useMarketStore((s) => s.setSmcToggle);
  const setDrawTool = useMarketStore((s) => s.setDrawTool);
  const currentPair = useMarketStore((s) => s.currentPair);

  const [colorPickerOpen, setColorPickerOpen] = useState(false);
  const [smaModalOpen, setSmaModalOpen] = useState(false);
  const [emaModalOpen, setEmaModalOpen] = useState(false);
  const [smcModalOpen, setSmcModalOpen] = useState(false);
  const [drawsModalOpen, setDrawsModalOpen] = useState(false);
  const [pulseOpen, setPulseOpen] = useState(false);
  const colorBtnRef = useRef<HTMLButtonElement>(null);
  const colorPopupRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!colorPickerOpen) return;
    const handler = (e: MouseEvent) => {
      if (
        colorPopupRef.current &&
        !colorPopupRef.current.contains(e.target as Node) &&
        colorBtnRef.current &&
        !colorBtnRef.current.contains(e.target as Node)
      ) {
        setColorPickerOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [colorPickerOpen]);

  const smaEnabled = chartIndicators.smaLines.some((l) => l.enabled);
  const emaEnabled = chartIndicators.emaLines.some((l) => l.enabled);

  return (
    <div className="chart-controls-bar" role="toolbar" aria-label="Controles del chart">
      <button
        type="button"
        className="chart-tool-button"
        title="Reset zoom (doble click)"
        aria-label="Restablecer zoom del chart"
        onClick={onResetChart}
      >
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M3 12a9 9 0 1 0 3-6.7"/>
          <path d="M3 4v5h5"/>
        </svg>
      </button>
      <span className="chart-controls-sep" aria-hidden />
      <div className="chart-mode-toggle" role="radiogroup" aria-label="Tipo de grafica">
        <button
          type="button"
          className={chartMode === 'lightweight' ? 'active' : ''}
          onClick={() => setChartMode('lightweight')}
        >
          Pro
        </button>
        <button
          type="button"
          className={chartMode === 'chartjs' ? 'active' : ''}
          onClick={() => setChartMode('chartjs')}
        >
          Chart.js
        </button>
        <button
          type="button"
          className={chartMode === 'tradingview' ? 'active' : ''}
          onClick={() => setChartMode('tradingview')}
        >
          TradingView
        </button>
      </div>
      <span className="chart-controls-sep" aria-hidden />
      <div className="interval-selector" role="radiogroup" aria-label="Intervalos de velas">
        {BUTTON_INTERVALS.map((iv) => (
          <button
            key={iv.key}
            type="button"
            className={currentInterval === iv.key ? 'active' : undefined}
            onClick={() => setCurrentInterval(iv.key)}
          >
            {iv.label}
          </button>
        ))}
        <select
          className="indicator-select"
          value={SELECT_INTERVALS.includes(currentInterval as typeof SELECT_INTERVALS[number]) ? currentInterval : ''}
          onChange={(e) => { if (e.target.value) setCurrentInterval(e.target.value); }}
          aria-label="Intervalos adicionales"
        >
          <option value="">+</option>
          {SELECT_INTERVALS.map((iv) => (
            <option key={iv} value={iv}>{iv}</option>
          ))}
        </select>
      </div>
      <span className="chart-controls-sep" aria-hidden />
      <div className="indicator-selector" aria-label="Indicadores tecnicos">
        {([
          { key: 'bollinger' as const, label: 'BB' },
          { key: 'volume' as const, label: 'VOL' },
          { key: 'volumeProfile' as const, label: 'VP' },
          { key: 'stochRsi' as const, label: 'Stoch RSI' },
          { key: 'rsiEnabled' as const, label: 'RSI' },
          { key: 'macd' as const, label: 'MACD' },
          { key: 'taker' as const, label: 'Taker C/V' },
          { key: 'divs' as const, label: 'Divs' },
          { key: 'signals' as const, label: 'Señales' },
        ]).map((ind) => (
          <button
            key={ind.key}
            type="button"
            className={`chart-indicator-toggle${chartIndicators[ind.key] ? ' active' : ''}`}
            onClick={() => {
              if (ind.key === 'rsiEnabled') setRsiEnabled(!chartIndicators.rsiEnabled);
              else setChartIndicator(ind.key, !chartIndicators[ind.key]);
            }}
          >
            {ind.label}
          </button>
        ))}
        {chartIndicators.rsiEnabled && (
          <select
            className="indicator-select active"
            value={String(chartIndicators.rsiPeriod)}
            onChange={(e) => setRsiPeriod(Number(e.target.value))}
            aria-label="RSI periodo"
          >
            {[7, 14, 21].map((p) => (
              <option key={p} value={p}>RSI {p}</option>
            ))}
          </select>
        )}
        <button
          type="button"
          className={`chart-indicator-toggle${smaEnabled ? ' active' : ''}`}
          onClick={() => setSmaModalOpen((v) => !v)}
        >
          SMA
        </button>
        <button
          type="button"
          className={`chart-indicator-toggle${emaEnabled ? ' active' : ''}`}
          onClick={() => setEmaModalOpen((v) => !v)}
        >
          EMA
        </button>
        <button
          type="button"
          className={`chart-indicator-toggle${SMC_ROWS.some((r) => chartIndicators.smc[r.key]) ? ' active' : ''}`}
          onClick={() => setSmcModalOpen((v) => !v)}
        >
          SMC
        </button>
        <button
          type="button"
          className={`chart-indicator-toggle${chartIndicators.drawTool === 'FIBO' ? ' active' : ''}`}
          onClick={() => setDrawTool(chartIndicators.drawTool === 'FIBO' ? null : 'FIBO')}
          title="Toca 2 puntos del chart"
        >
          Fibo
        </button>
        <select
          className="indicator-select"
          value={chartIndicators.drawTool != null && chartIndicators.drawTool !== 'FIBO' ? chartIndicators.drawTool : ''}
          onChange={(e) => {
            const v = e.target.value;
            const tool: DrawTool = v === '' ? null : isDrawKind(v) ? v : null;
            setDrawTool(tool);
          }}
          aria-label="Herramienta de dibujo"
        >
          <option value="">Dibujo</option>
          {DRAW_KINDS.map((k) => (
            <option key={k} value={k}>{drawKindLabel(k)}</option>
          ))}
        </select>
        <button
          type="button"
          className="chart-indicator-toggle"
          onClick={() => setDrawsModalOpen(true)}
        >
          Dibujos
        </button>
        <button
          type="button"
          className="chart-indicator-toggle"
          onClick={() => setPulseOpen(true)}
        >
          Pulso
        </button>
        <span className="chart-controls-sep" aria-hidden />
        <button
          type="button"
          className={`chart-tool-button${measureActive ? ' active' : ''}`}
          title="Medir rango"
          aria-label="Medir rango de precio"
          aria-pressed={measureActive}
          onClick={() => onMeasureActiveChange(!measureActive)}
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M21.3 8.7 15.3 2.7" />
            <path d="M2.7 21.3 8.7 15.3" />
            <line x1="15.3" y1="8.7" x2="8.7" y2="15.3" />
            <line x1="13" y1="4" x2="20" y2="11" />
            <line x1="4" y1="13" x2="11" y2="20" />
          </svg>
        </button>
        <div className="color-picker-wrapper" ref={colorPopupRef}>
          <button
            type="button"
            ref={colorBtnRef}
            className={`chart-tool-button${colorPickerOpen ? ' active' : ''}`}
            onClick={() => setColorPickerOpen((v) => !v)}
            aria-label="Colores de indicadores"
          >
            🎨
          </button>
          {colorPickerOpen && (
            <div className="color-picker-popup">
              {chartIndicators.stochRsi && (
                <>
                  <label className="color-picker-row">
                    <span className="color-label">K</span>
                    <input type="color" value={chartIndicators.colors.stochK} onInput={(e) => chartRef.current?.patchColor('stochK', (e.target as HTMLInputElement).value)} onChange={(e) => setIndicatorColor('stochK', (e.target as HTMLInputElement).value)} />
                  </label>
                  <label className="color-picker-row">
                    <span className="color-label">D</span>
                    <input type="color" value={chartIndicators.colors.stochD} onInput={(e) => chartRef.current?.patchColor('stochD', (e.target as HTMLInputElement).value)} onChange={(e) => setIndicatorColor('stochD', (e.target as HTMLInputElement).value)} />
                  </label>
                </>
              )}
              {chartIndicators.rsiEnabled && (
                <label className="color-picker-row">
                  <span className="color-label">RSI</span>
                    <input type="color" value={chartIndicators.colors.rsi} onInput={(e) => chartRef.current?.patchColor('rsi', (e.target as HTMLInputElement).value)} onChange={(e) => setIndicatorColor('rsi', (e.target as HTMLInputElement).value)} />
                </label>
              )}
              {chartIndicators.bollinger && (
                <>
                  <label className="color-picker-row">
                    <span className="color-label">BB</span>
                    <input type="color" value={chartIndicators.colors.bbLine} onInput={(e) => chartRef.current?.patchColor('bbLine', (e.target as HTMLInputElement).value)} onChange={(e) => setIndicatorColor('bbLine', (e.target as HTMLInputElement).value)} />
                  </label>
                  <label className="color-picker-row">
                    <span className="color-label">Basis</span>
                    <input type="color" value={chartIndicators.colors.bbBasis} onInput={(e) => chartRef.current?.patchColor('bbBasis', (e.target as HTMLInputElement).value)} onChange={(e) => setIndicatorColor('bbBasis', (e.target as HTMLInputElement).value)} />
                  </label>
                </>
              )}
            </div>
          )}
        </div>
      </div>

      {smaModalOpen && (
        <MaModal
          title="SMA"
          lines={chartIndicators.smaLines}
          onUpdate={setSmaLine}
          onAdd={addSmaLine}
          onRemove={removeSmaLine}
          onClose={() => setSmaModalOpen(false)}
        />
      )}
      {emaModalOpen && (
        <MaModal
          title="EMA"
          lines={chartIndicators.emaLines}
          onUpdate={setEmaLine}
          onAdd={addEmaLine}
          onRemove={removeEmaLine}
          onClose={() => setEmaModalOpen(false)}
        />
      )}
      {smcModalOpen && (
        <div className="ma-modal-overlay">
          <div className="ma-modal" role="dialog" aria-label="SMC">
            <div className="ma-modal-header">
              <span>SMC</span>
              <button type="button" className="ma-modal-close" onClick={() => setSmcModalOpen(false)}>✕</button>
            </div>
            <div className="ma-modal-body">
              {SMC_ROWS.map((row) => (
                <div className="ma-modal-row" key={row.key}>
                  <label className="ma-modal-check">
                    <input
                      type="checkbox"
                      checked={chartIndicators.smc[row.key]}
                      onChange={() => setSmcToggle(row.key, !chartIndicators.smc[row.key])}
                    />
                  </label>
                  <span className="ma-modal-label">{row.label}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
      {drawsModalOpen && (
        <FibDrawModal symbol={currentPair} onClose={() => setDrawsModalOpen(false)} />
      )}
      {pulseOpen && <PulsePanel onClose={() => setPulseOpen(false)} />}
    </div>
  );
}

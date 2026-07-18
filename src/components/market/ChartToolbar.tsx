import { type ChangeEvent, useEffect, useRef, useState } from 'react';
import { useMarketStore } from '@/store/useMarketStore';
import { SMA_PERIOD_OPTIONS } from '@/lib/chart/types';
import { CHART_INTERVALS, BINANCE_NATIVE_INTERVALS } from '@/lib/config';
import type { ChartHandle } from '@/components/market/CandlestickChart';

interface ChartToolbarProps {
  chartRef: React.RefObject<ChartHandle>;
  measureActive: boolean;
  onMeasureActiveChange: (active: boolean) => void;
  onResetChart: () => void;
}

const ALLOWED_PERIODS = SMA_PERIOD_OPTIONS as readonly number[];

// ponytail: 12 buttons for the most-used intervals, all others in a select
const BUTTON_INTERVAL_KEYS = ['1m', '5m', '15m', '1h', '4h', '12h', '1d', '3d', '5d', '1w', '1M', '3M'];
const BUTTON_INTERVALS = CHART_INTERVALS.filter((iv) => BUTTON_INTERVAL_KEYS.includes(iv.key));
const SELECT_INTERVALS = BINANCE_NATIVE_INTERVALS.filter(
  (iv) => !BUTTON_INTERVAL_KEYS.includes(iv),
);

export function ChartToolbar({ chartRef, measureActive, onMeasureActiveChange, onResetChart }: ChartToolbarProps) {
  const chartMode = useMarketStore((s) => s.chartMode);
  const setChartMode = useMarketStore((s) => s.setChartMode);
  const currentInterval = useMarketStore((s) => s.currentInterval);
  const setCurrentInterval = useMarketStore((s) => s.setCurrentInterval);
  const chartIndicators = useMarketStore((s) => s.chartIndicators);
  const setChartIndicator = useMarketStore((s) => s.setChartIndicator);
  const setSmaPeriod = useMarketStore((s) => s.setSmaPeriod);
  const setEmaPeriod = useMarketStore((s) => s.setEmaPeriod);
  const setRsiEnabled = useMarketStore((s) => s.setRsiEnabled);
  const setRsiPeriod = useMarketStore((s) => s.setRsiPeriod);
  const setIndicatorColor = useMarketStore((s) => s.setIndicatorColor);

  const [colorPickerOpen, setColorPickerOpen] = useState(false);
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

  const handleSmaPeriod = (e: ChangeEvent<HTMLSelectElement>) => {
    const v = Number(e.target.value);
    if (ALLOWED_PERIODS.includes(v)) setSmaPeriod(v);
  };
  const handleEmaPeriod = (e: ChangeEvent<HTMLSelectElement>) => {
    const v = Number(e.target.value);
    if (ALLOWED_PERIODS.includes(v)) setEmaPeriod(v);
  };

  const smaSelectValue = chartIndicators.smaEnabled ? String(chartIndicators.smaPeriod) : '';
  const emaSelectValue = chartIndicators.emaEnabled ? String(chartIndicators.emaPeriod) : '';

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
        <select
          className={`indicator-select${chartIndicators.smaEnabled ? ' active' : ''}`}
          value={smaSelectValue}
          onChange={(e) => {
            const v = e.target.value;
            if (v === '') { setChartIndicator('smaEnabled', false); return; }
            handleSmaPeriod(e);
            setChartIndicator('smaEnabled', true);
          }}
          aria-label="SMA periodo"
        >
          <option value="">SMA</option>
          {ALLOWED_PERIODS.map((p) => (
            <option key={p} value={p}>SMA {p}</option>
          ))}
        </select>
        <select
          className={`indicator-select${chartIndicators.emaEnabled ? ' active' : ''}`}
          value={emaSelectValue}
          onChange={(e) => {
            const v = e.target.value;
            if (v === '') { setChartIndicator('emaEnabled', false); return; }
            handleEmaPeriod(e);
            setChartIndicator('emaEnabled', true);
          }}
          aria-label="EMA periodo"
        >
          <option value="">EMA</option>
          {ALLOWED_PERIODS.map((p) => (
            <option key={p} value={p}>EMA {p}</option>
          ))}
        </select>
        <span className="chart-controls-sep" aria-hidden />
        <button
          type="button"
          className={`chart-tool-button${measureActive ? ' active' : ''}`}
          title="Medir rango"
          aria-label="Medir rango de precio"
          aria-pressed={measureActive}
          onClick={() => onMeasureActiveChange(!measureActive)}
        >
          %
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
              {chartIndicators.smaEnabled && (
                <label className="color-picker-row">
                  <span className="color-label">SMA</span>
                    <input type="color" value={chartIndicators.colors.sma} onInput={(e) => chartRef.current?.patchColor('sma', (e.target as HTMLInputElement).value)} onChange={(e) => setIndicatorColor('sma', (e.target as HTMLInputElement).value)} />
                </label>
              )}
              {chartIndicators.emaEnabled && (
                <label className="color-picker-row">
                  <span className="color-label">EMA</span>
                    <input type="color" value={chartIndicators.colors.ema} onInput={(e) => chartRef.current?.patchColor('ema', (e.target as HTMLInputElement).value)} onChange={(e) => setIndicatorColor('ema', (e.target as HTMLInputElement).value)} />
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
    </div>
  );
}

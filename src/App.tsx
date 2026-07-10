import { type ChangeEvent, useEffect, useRef, useState } from 'react';
import {
  Chart,
  BarController,
  BarElement,
  LineController,
  LineElement,
  PointElement,
  LinearScale,
  TimeScale,
  CategoryScale,
  Tooltip,
  Filler,
} from 'chart.js';
import { CandlestickController, CandlestickElement } from 'chartjs-chart-financial';
import 'chartjs-adapter-date-fns';
import { Header } from '@/components/layout/Header';
import { Footer } from '@/components/layout/Footer';
import { PairSearch } from '@/components/market/PairSearch';
import { TrackedPairs } from '@/components/market/TrackedPairs';
import CandlestickChart from '@/components/market/CandlestickChart';
import type { ChartHandle } from '@/components/market/CandlestickChart';
import { WalletSection } from '@/components/wallet/WalletSection';
import TransactionSection from '@/components/transactions/TransactionSection';
import { migrateAppStorage, readTrackedPairs, writeTrackedPairs, readIndicatorColors, writeIndicatorColors } from '@/lib/storage';
import { useMarketStore } from '@/store/useMarketStore';
import { fetch24hStats } from '@/api/binance';
import { formatPrice } from '@/lib/utils';
import { compactNumber } from '@/lib/chart/normalize';
import { APP_NAME, CHART_INTERVALS, BINANCE_NATIVE_INTERVALS, splitPairSymbol } from '@/lib/config';

interface Stats24h {
  priceChange: string;
  priceChangePercent: string;
  highPrice: number;
  lowPrice: number;
  volume: number;
  quoteVolume: number;
}

export default function App() {
  const activeView = useMarketStore((s) => s.activeView);
  const setActiveView = useMarketStore((s) => s.setActiveView);
  const setTracked = useMarketStore((s) => s.setTracked);
  const currentPair = useMarketStore((s) => s.currentPair);
  const currentInterval = useMarketStore((s) => s.currentInterval);
  const chartIndicators = useMarketStore((s) => s.chartIndicators);
  const setCurrentInterval = useMarketStore((s) => s.setCurrentInterval);
  const setChartIndicator = useMarketStore((s) => s.setChartIndicator);
  const setSmaPeriod = useMarketStore((s) => s.setSmaPeriod);
  const setEmaPeriod = useMarketStore((s) => s.setEmaPeriod);
  const setRsiEnabled = useMarketStore((s) => s.setRsiEnabled);
  const setRsiPeriod = useMarketStore((s) => s.setRsiPeriod);
  const setIndicatorColor = useMarketStore((s) => s.setIndicatorColor);
  const lastPrices = useMarketStore((s) => s.lastPrices);
  const [stats24h, setStats24h] = useState<Stats24h | null>(null);
  const [chartResetSignal, setChartResetSignal] = useState(0);
  const [measureActive, setMeasureActive] = useState(false);
  const [colorPickerOpen, setColorPickerOpen] = useState(false);
  const colorBtnRef = useRef<HTMLButtonElement>(null);
  const colorPopupRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<ChartHandle>(null);

  useEffect(() => {
    if (!currentPair) { setStats24h(null); return; }
    let cancelled = false;
    (async () => {
      const res = await fetch24hStats(currentPair);
      if (cancelled || !res) return;
      setStats24h({
        priceChange: String(res.priceChange ?? '0'),
        priceChangePercent: String(res.priceChangePercent ?? '0'),
        highPrice: Number(res.highPrice ?? 0),
        lowPrice: Number(res.lowPrice ?? 0),
        volume: Number(res.volume ?? 0),
        quoteVolume: Number(res.quoteVolume ?? 0),
      });
    })();
    return () => { cancelled = true; };
  }, [currentPair]);

  useEffect(() => {
    if (!currentPair) {
      document.title = APP_NAME;
      return;
    }
    const { base } = splitPairSymbol(currentPair);
    const price = lastPrices[currentPair];
    const pct = stats24h ? parseFloat(stats24h.priceChangePercent) : NaN;
    if (price == null || !Number.isFinite(price)) {
      document.title = `${base} | ${APP_NAME}`;
      return;
    }
    const arrow = Number.isFinite(pct) ? (pct >= 0 ? '\u25B2' : '\u25BC') : '';
    const sign = Number.isFinite(pct) ? (pct >= 0 ? '+' : '') : '';
    const pctText = Number.isFinite(pct) ? `${sign}${pct.toFixed(2)}%` : '';
    document.title = `${base} ${formatPrice(price)}${arrow ? ' ' + arrow : ''}${pctText ? ' ' + pctText : ''}`;
  }, [currentPair, lastPrices, stats24h]);

  useEffect(() => {
    migrateAppStorage();
    setTracked(readTrackedPairs());

    const savedColors = readIndicatorColors();
    useMarketStore.setState((state) => ({
      chartIndicators: { ...state.chartIndicators, colors: savedColors },
    }));

    Chart.register(
      BarController,
      BarElement,
      LineController,
      LineElement,
      PointElement,
      LinearScale,
      TimeScale,
      CategoryScale,
      Tooltip,
      Filler,
      CandlestickController,
      CandlestickElement,
    );

    const unsubTracked = useMarketStore.subscribe((state) => {
      writeTrackedPairs(state.tracked);
    });
    let colorSaveTimer: ReturnType<typeof setTimeout> | null = null;
    const unsubColors = useMarketStore.subscribe((state, prevState) => {
      if (state.chartIndicators.colors !== prevState.chartIndicators.colors) {
        if (colorSaveTimer !== null) clearTimeout(colorSaveTimer);
        colorSaveTimer = setTimeout(
          () => writeIndicatorColors(state.chartIndicators.colors),
          300,
        );
      }
    });

    const handler = (event: PromiseRejectionEvent) => {
      if (
        event.reason &&
        (event.reason.code === 4001 ||
          (event.reason.message && event.reason.message.includes('User rejected')))
      ) {
        event.preventDefault();
      }
    };
    window.addEventListener('unhandledrejection', handler);

    return () => {
      unsubTracked();
      unsubColors();
      if (colorSaveTimer !== null) clearTimeout(colorSaveTimer);
      window.removeEventListener('unhandledrejection', handler);
    };
    // ponytail: mount once
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

  const ALLOWED_PERIODS = [40, 50, 75, 100, 150, 200];

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

  // ponytail: 12 buttons for the most-used intervals, all others in a select
  const buttonIntervalKeys = ['1m','5m','15m','1h','4h','12h','1d','3d','5d','1w','1M','3M'];
  const buttonIntervals = CHART_INTERVALS.filter((iv) => buttonIntervalKeys.includes(iv.key));
  const selectIntervals = BINANCE_NATIVE_INTERVALS.filter(
    (iv) => !buttonIntervalKeys.includes(iv),
  );

  return (
    <>
      <Header />
      <nav className="view-tabs" role="tablist" aria-label="Navegacion principal">
        <button
          role="tab"
          aria-selected={activeView === 'market'}
          className={activeView === 'market' ? 'active' : ''}
          onClick={() => setActiveView('market')}
        >
          Mercado
        </button>
        <button
          role="tab"
          aria-selected={activeView === 'wallet'}
          className={activeView === 'wallet' ? 'active' : ''}
          onClick={() => setActiveView('wallet')}
        >
          Wallet
        </button>
      </nav>
      <main className={`main-grid view-${activeView}`}>
        <section className="market-view">
          <div className="market-chart" id="pair-details">
            {currentPair ? (
              <>
                <div className="chart-topline">
                  <div className="chart-market-summary">
                    <h3 id="pair-title">{currentPair}</h3>
                    {stats24h && (
                      <div id="pair-price">
                        <strong>{formatPrice(lastPrices[currentPair] ?? 0)}</strong>
                        <span className={parseFloat(stats24h.priceChangePercent) >= 0 ? 'positive' : 'negative'}>
                          {parseFloat(stats24h.priceChangePercent) >= 0 ? '+' : ''}{parseFloat(stats24h.priceChangePercent).toFixed(2)}%
                        </span>
                      </div>
                    )}
                    {stats24h && (
                      <div className="pair-stats">
                        <div><span className="label">24h</span> {parseFloat(stats24h.priceChange) >= 0 ? '+' : ''}{parseFloat(stats24h.priceChange).toFixed(4)}</div>
                        <div><span className="label">Max</span> {stats24h.highPrice.toLocaleString()}</div>
                        <div><span className="label">Min</span> {stats24h.lowPrice.toLocaleString()}</div>
                        <div><span className="label">Vol</span> {compactNumber(stats24h.quoteVolume)}</div>
                      </div>
                    )}
                  </div>
                  <div className="chart-controls-bar" role="toolbar" aria-label="Controles del chart">
                    <button
                      type="button"
                      className="chart-tool-button"
                      title="Reset zoom (doble click)"
                      aria-label="Restablecer zoom del chart"
                      onClick={() => setChartResetSignal((n) => n + 1)}
                    >
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                        <path d="M3 12a9 9 0 1 0 3-6.7"/>
                        <path d="M3 4v5h5"/>
                      </svg>
                    </button>
                    <span className="chart-controls-sep" aria-hidden />
                    <div className="interval-selector" role="radiogroup" aria-label="Intervalos de velas">
                      {buttonIntervals.map((iv) => (
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
                        value={selectIntervals.includes(currentInterval as typeof selectIntervals[number]) ? currentInterval : ''}
                        onChange={(e) => { if (e.target.value) setCurrentInterval(e.target.value); }}
                        aria-label="Intervalos adicionales"
                      >
                        <option value="">+</option>
                        {selectIntervals.map((iv) => (
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
                        onClick={() => setMeasureActive((v) => !v)}
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
                </div>
              <div id="chart-wrapper">
                  <CandlestickChart
                    ref={chartRef}
                    symbol={currentPair}
                    interval={currentInterval}
                    indicators={chartIndicators}
                    measureActive={measureActive}
                    resetSignal={chartResetSignal}
                  />
                </div>
              </>
            ) : (
              <div className="chart-empty-state">
                <div className="chart-empty-icon">
                  <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2" opacity="0.4">
                    <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>
                  </svg>
                </div>
                <p>Selecciona un par para ver la grafica</p>
              </div>
            )}
          </div>
          <aside className="market-sidebar" aria-label="Lista de pares">
            <div className="market-sidebar-header">
              <h1>Mercado spot</h1>
            </div>
            <PairSearch />
            <TrackedPairs />
          </aside>
        </section>
        <section className="wallet-view">
          <WalletSection />
          <TransactionSection />
        </section>
      </main>
      <Footer />
    </>
  );
}

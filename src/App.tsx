import { type ChangeEvent, useEffect, useState } from 'react';
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
import { WalletSection } from '@/components/wallet/WalletSection';
import TransactionSection from '@/components/transactions/TransactionSection';
import { migrateAppStorage, readTrackedPairs, writeTrackedPairs } from '@/lib/storage';
import { useMarketStore } from '@/store/useMarketStore';
import { fetch24hStats } from '@/api/binance';
import { formatPrice } from '@/lib/utils';
import { compactNumber } from '@/lib/chart/normalize';
import { APP_NAME, CHART_INTERVALS, splitPairSymbol } from '@/lib/config';

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
  const lastPrices = useMarketStore((s) => s.lastPrices);
  const [stats24h, setStats24h] = useState<Stats24h | null>(null);
  const [chartResetSignal, setChartResetSignal] = useState(0);
  const [measureActive, setMeasureActive] = useState(false);

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

    const unsub = useMarketStore.subscribe((state) => {
      writeTrackedPairs(state.tracked);
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
      unsub();
      window.removeEventListener('unhandledrejection', handler);
    };
    // ponytail: mount once
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSmaPeriod = (e: ChangeEvent<HTMLSelectElement>) => {
    const v = Number(e.target.value);
    if (v === 100 || v === 200) setSmaPeriod(v);
  };
  const handleEmaPeriod = (e: ChangeEvent<HTMLSelectElement>) => {
    const v = Number(e.target.value);
    if (v === 100 || v === 200) setEmaPeriod(v);
  };

  const smaSelectValue = chartIndicators.smaEnabled ? String(chartIndicators.smaPeriod) : '';
  const emaSelectValue = chartIndicators.emaEnabled ? String(chartIndicators.emaPeriod) : '';

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
                      {CHART_INTERVALS.map((iv) => (
                        <button
                          key={iv.key}
                          type="button"
                          className={currentInterval === iv.key ? 'active' : undefined}
                          onClick={() => setCurrentInterval(iv.key)}
                        >
                          {iv.label}
                        </button>
                      ))}
                    </div>
                    <span className="chart-controls-sep" aria-hidden />
                    <div className="indicator-selector" aria-label="Indicadores tecnicos">
                      {([
                        { key: 'bollinger' as const, label: 'BB' },
                        { key: 'volume' as const, label: 'VOL' },
                        { key: 'volumeProfile' as const, label: 'VP' },
                        { key: 'stochRsi' as const, label: 'Stoch RSI' },
                      ]).map((ind) => (
                        <button
                          key={ind.key}
                          type="button"
                          className={`chart-indicator-toggle${chartIndicators[ind.key] ? ' active' : ''}`}
                          onClick={() => setChartIndicator(ind.key, !chartIndicators[ind.key])}
                        >
                          {ind.label}
                        </button>
                      ))}
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
                        <option value="200">SMA 200</option>
                        <option value="100">SMA 100</option>
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
                        <option value="200">EMA 200</option>
                        <option value="100">EMA 100</option>
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
                    </div>
                  </div>
                </div>
                <div id="chart-wrapper">
                  <CandlestickChart
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

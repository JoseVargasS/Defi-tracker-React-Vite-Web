import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { Header } from '@/components/layout/Header';
import { Footer } from '@/components/layout/Footer';
import { PairSearch } from '@/components/market/PairSearch';
import { TrackedPairs } from '@/components/market/TrackedPairs';
import type { ChartHandle } from '@/components/market/CandlestickChart';
const CandlestickChart = lazy(() => import('@/components/market/CandlestickChart'));
import { ChartToolbar } from '@/components/market/ChartToolbar';
import TradingViewWidget from '@/components/market/TradingViewWidget';
import { WalletSection } from '@/components/wallet/WalletSection';
import TransactionSection from '@/components/transactions/TransactionSection';
import { migrateAppStorage, readTrackedPairs, writeTrackedPairs, readIndicatorColors, writeIndicatorColors } from '@/lib/storage';
import { useMarketStore } from '@/store/useMarketStore';
import { fetch24hStats } from '@/api/binance';
import { formatPrice } from '@/lib/utils';
import { compactNumber } from '@/lib/chart/normalize';
import { APP_NAME, splitPairSymbol } from '@/lib/config';

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
  const chartMode = useMarketStore((s) => s.chartMode);
  const setTracked = useMarketStore((s) => s.setTracked);
  const currentPair = useMarketStore((s) => s.currentPair);
  const currentInterval = useMarketStore((s) => s.currentInterval);
  const chartIndicators = useMarketStore((s) => s.chartIndicators);
  const lastPrices = useMarketStore((s) => s.lastPrices);
  const [stats24h, setStats24h] = useState<Stats24h | null>(null);
  const [chartResetSignal, setChartResetSignal] = useState(0);
  const [measureActive, setMeasureActive] = useState(false);
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

    (async () => {
      const [
        { Chart: C, BarController, BarElement, LineController, LineElement,
          PointElement, LinearScale, TimeScale, CategoryScale, Tooltip, Filler },
        { CandlestickController, CandlestickElement },
      ] = await Promise.all([
        import('chart.js'),
        import('chartjs-chart-financial'),
      ]);
      C.register(
        BarController, BarElement, LineController, LineElement, PointElement,
        LinearScale, TimeScale, CategoryScale, Tooltip, Filler,
        CandlestickController, CandlestickElement,
      );
    })();

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

  return (
    <>
      <Header />
      <nav className="view-tabs" role="tablist" aria-label="Navegacion principal">
        <button
          type="button"
          role="tab"
          aria-selected={activeView === 'market'}
          className={activeView === 'market' ? 'active' : ''}
          onClick={() => setActiveView('market')}
        >
          Mercado
        </button>
        <button
          type="button"
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
                  <ChartToolbar
                    chartRef={chartRef}
                    measureActive={measureActive}
                    onMeasureActiveChange={setMeasureActive}
                    onResetChart={() => setChartResetSignal((n) => n + 1)}
                  />
                </div>
              <div id="chart-wrapper">
                  {chartMode === 'chartjs' ? (
                    <Suspense fallback={<div style={{ height: 500 }} />}>
                      <CandlestickChart
                        ref={chartRef}
                        symbol={currentPair}
                        interval={currentInterval}
                        indicators={chartIndicators}
                        measureActive={measureActive}
                        resetSignal={chartResetSignal}
                      />
                    </Suspense>
                  ) : (
                    <TradingViewWidget key={`${currentPair}-${currentInterval}`} symbol={currentPair} interval={currentInterval} />
                  )}
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

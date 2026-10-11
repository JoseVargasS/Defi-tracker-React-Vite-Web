import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { Header } from '@/components/layout/Header'
import AiChatPanel from '@/components/ai/AiChatPanel';
import { Footer } from '@/components/layout/Footer';
import { PairSearch } from '@/components/market/PairSearch';
import { TrackedPairs } from '@/components/market/TrackedPairs';
import type { ChartHandle } from '@/components/market/CandlestickChart';
const CandlestickChart = lazy(() => import('@/components/market/CandlestickChart'));
const LightweightChart = lazy(() => import('@/components/market/LightweightChart'));
import { ChartToolbar } from '@/components/market/ChartToolbar';
import TradingViewWidget from '@/components/market/TradingViewWidget';
import { WalletSection } from '@/components/wallet/WalletSection';
import TransactionSection from '@/components/transactions/TransactionSection';
import { migrateAppStorage, readTrackedPairs, writeTrackedPairs, readIndicatorColors, writeIndicatorColors, readSmaLines, writeSmaLines, readEmaLines, writeEmaLines, readChartToggles, writeChartToggles, readCurrentPair, writeCurrentPair, readCurrentInterval, writeCurrentInterval, readChartMode, writeChartMode } from '@/lib/storage';
import { useMarketStore } from '@/store/useMarketStore';
import { fetchPairDetail, displayPairLabel } from '@/api/market';
import { formatPrice } from '@/lib/utils';
import { compactNumber } from '@/lib/chart/normalize';
import { formatPriceForChart } from '@/lib/chart/priceFormat';
import { APP_NAME, pairKey, parseTrackedPair, sourceLabel, type PairSource } from '@/lib/config';

interface Stats24h {
  price: number | null;
  priceChange: string;
  priceChangePercent: string;
  highPrice: number;
  lowPrice: number;
  volume: number;
  quoteVolume: number;
}

// Ticker para mostrar según fuente: spot con slash (BTC/USDT),
// perpetuos estilo exchange sin slash (SUIUSDT) + badge de fuente.
function headerLabel(entry: string): { label: string; source: PairSource } {
  const { source } = parseTrackedPair(entry);
  return { label: displayPairLabel(entry), source };
}

export default function App() {
  const activeView = useMarketStore((s) => s.activeView);
  const setActiveView = useMarketStore((s) => s.setActiveView);
  const chartMode = useMarketStore((s) => s.chartMode);
  const setTracked = useMarketStore((s) => s.setTracked);
  const currentPair = useMarketStore((s) => s.currentPair);
  const currentInterval = useMarketStore((s) => s.currentInterval);
  const chartIndicators = useMarketStore((s) => s.chartIndicators);
  const overlaysTick = useMarketStore((s) => s.overlaysTick);
  const lastPrices = useMarketStore((s) => s.lastPrices);
  const [stats24h, setStats24h] = useState<Stats24h | null>(null);
  const [chartResetSignal, setChartResetSignal] = useState(0);
  const chartRef = useRef<ChartHandle>(null);
  const title = headerLabel(currentPair ?? '');
  // En vivo manda el socket; lastPrices solo lo alimenta spot; el detail es el piso.
  const liveQuote = useMarketStore((s) => {
    if (!currentPair) return undefined;
    const { symbol, source } = parseTrackedPair(currentPair);
    return s.liveQuotes[pairKey(symbol, source)];
  });
  const headerPrice = liveQuote?.price ?? (currentPair ? lastPrices[currentPair] : undefined) ?? stats24h?.price ?? null;
  const headerPct = liveQuote?.changePercent ?? (stats24h ? parseFloat(stats24h.priceChangePercent) : NaN);

  useEffect(() => {
    if (!currentPair) { setStats24h(null); return; }
    let cancelled = false;
    (async () => {
      const res = await fetchPairDetail(currentPair);
      if (cancelled || !res) return;
      setStats24h({
        price: Number.isFinite(res.price) ? res.price : null,        priceChange: String(res.priceChange ?? '0'),
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
    const { label } = headerLabel(currentPair);
    if (headerPrice == null || !Number.isFinite(headerPrice)) {
      document.title = `${label} | ${APP_NAME}`;
      return;
    }
    const arrow = Number.isFinite(headerPct) ? (headerPct >= 0 ? '\u25B2' : '\u25BC') : '';
    const sign = Number.isFinite(headerPct) ? (headerPct >= 0 ? '+' : '') : '';
    const pctText = Number.isFinite(headerPct) ? `${sign}${headerPct.toFixed(2)}%` : '';
    document.title = `${label} ${formatPrice(headerPrice)}${arrow ? ' ' + arrow : ''}${pctText ? ' ' + pctText : ''}`;
  }, [currentPair, headerPrice, headerPct, title.label]);

  useEffect(() => {
    migrateAppStorage();
    const tracked = readTrackedPairs();
    setTracked(tracked);

    const savedColors = readIndicatorColors();
    const savedSmaLines = readSmaLines();
    const savedEmaLines = readEmaLines();
    const savedToggles = readChartToggles();
    const savedPair = readCurrentPair();
    const savedInterval = readCurrentInterval();
    const savedMode = readChartMode();
    useMarketStore.setState((state) => ({
      currentPair: savedPair ?? state.currentPair,
      currentInterval: savedInterval,
      chartMode: savedMode,
      chartIndicators: {
        ...state.chartIndicators,
        ...savedToggles,
        smc: { ...savedToggles.smc },
        colors: savedColors,
        smaLines: savedSmaLines,
        emaLines: savedEmaLines,
      },
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

    let saveTimer: ReturnType<typeof setTimeout> | null = null;
    const unsub = useMarketStore.subscribe((state, prevState) => {
      if (state.tracked !== prevState.tracked) writeTrackedPairs(state.tracked);
      const c = state.chartIndicators;
      const p = prevState.chartIndicators;
      const uiChanged =
        state.currentPair !== prevState.currentPair ||
        state.currentInterval !== prevState.currentInterval ||
        state.chartMode !== prevState.chartMode;
      const togglesChanged =
        uiChanged ||
        c.bollinger !== p.bollinger ||
        c.volume !== p.volume ||
        c.stochRsi !== p.stochRsi ||
        c.volumeProfile !== p.volumeProfile ||
        c.macd !== p.macd ||
        c.taker !== p.taker ||
        c.divs !== p.divs ||
        c.signals !== p.signals ||
        c.rsiEnabled !== p.rsiEnabled ||
        c.rsiPeriod !== p.rsiPeriod ||
        c.smc !== p.smc ||
        c.drawTool !== p.drawTool ||
        c.colors !== p.colors ||
        c.smaLines !== p.smaLines ||
        c.emaLines !== p.emaLines;
      if (!togglesChanged) return;
      if (saveTimer !== null) clearTimeout(saveTimer);
      const snapshot = state;
      saveTimer = setTimeout(() => {
        const ind = snapshot.chartIndicators;
        writeChartToggles({
          bollinger: ind.bollinger,
          volume: ind.volume,
          stochRsi: ind.stochRsi,
          volumeProfile: ind.volumeProfile,
          macd: ind.macd,
          taker: ind.taker,
          divs: ind.divs,
          signals: ind.signals,
          rsiEnabled: ind.rsiEnabled,
          rsiPeriod: ind.rsiPeriod,
          smc: ind.smc,
          drawTool: ind.drawTool,
        });
        writeIndicatorColors(ind.colors);
        writeSmaLines(ind.smaLines);
        writeEmaLines(ind.emaLines);
        writeCurrentPair(snapshot.currentPair);
        writeCurrentInterval(snapshot.currentInterval);
        writeChartMode(snapshot.chartMode);
      }, 300);
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
      if (saveTimer !== null) clearTimeout(saveTimer);
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
                    <h3 id="pair-title">{title.label}</h3>
                    <span className="coin-source">{sourceLabel(title.source)}</span>
                    {(stats24h || liveQuote) && (
                      <div id="pair-price">
                        <strong>{headerPrice != null ? formatPrice(headerPrice) : '-'}</strong>
                        {Number.isFinite(headerPct) && (
                          <span className={headerPct >= 0 ? 'positive' : 'negative'}>
                            {headerPct >= 0 ? '+' : ''}{headerPct.toFixed(2)}%
                          </span>
                        )}
                      </div>
                    )}
                    {stats24h && (
                      <div className="pair-stats">
                        <div><span className="label">24h</span> {parseFloat(stats24h.priceChange) >= 0 ? '+' : ''}{formatPriceForChart(parseFloat(stats24h.priceChange))}</div>
                        <div><span className="label">Max</span> {formatPriceForChart(stats24h.highPrice)}</div>
                        <div><span className="label">Min</span> {formatPriceForChart(stats24h.lowPrice)}</div>
                        <div><span className="label">Vol</span> {compactNumber(stats24h.quoteVolume)}</div>
                      </div>
                    )}
                  </div>
                  <ChartToolbar
                    chartRef={chartRef}
                    onResetChart={() => setChartResetSignal((n) => n + 1)}
                  />
                </div>
              <div id="chart-wrapper">
                  {chartMode === 'lightweight' ? (
                    <Suspense fallback={<div style={{ height: 500 }} />}>
                      <LightweightChart
                        ref={chartRef}
                        symbol={currentPair}
                        interval={currentInterval}
                        indicators={chartIndicators}
                        overlaysTick={overlaysTick}
                        resetSignal={chartResetSignal}
                      />
                    </Suspense>
                  ) : chartMode === 'chartjs' ? (
                    <Suspense fallback={<div style={{ height: 500 }} />}>
                      <CandlestickChart
                        ref={chartRef}
                        symbol={currentPair}
                        interval={currentInterval}
                        indicators={chartIndicators}
                        resetSignal={chartResetSignal}
                      />
                    </Suspense>
                  ) : (
                    <TradingViewWidget key={currentPair} symbol={currentPair} />
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
      <AiChatPanel />
      <Footer />
    </>
  );
}

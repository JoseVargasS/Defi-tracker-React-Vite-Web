import { useEffect, useState } from 'react';
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

const INTERVALS = [
  { key: '3M', label: '3M' },
  { key: '1M', label: '1M' },
  { key: '1w', label: '1w' },
  { key: '5d', label: '5D' },
  { key: '3d', label: '3D' },
  { key: '1d', label: '1D' },
  { key: '12h', label: '12H' },
  { key: '4h', label: '4H' },
  { key: '1h', label: '1H' },
  { key: '15m', label: '15m' },
  { key: '5m', label: '5m' },
  { key: '1m', label: '1m' },
] as const;

interface Stats24h {
  priceChange: string;
  priceChangePercent: string;
  highPrice: number;
  lowPrice: number;
  volume: number;
  quoteVolume: number;
}

export default function App() {
  const setTracked = useMarketStore((s) => s.setTracked);
  const currentPair = useMarketStore((s) => s.currentPair);
  const currentInterval = useMarketStore((s) => s.currentInterval);
  const chartZoom = useMarketStore((s) => s.chartZoom);
  const chartIndicators = useMarketStore((s) => s.chartIndicators);
  const chartMeasure = useMarketStore((s) => s.chartMeasure);
  const setChartMeasureActive = useMarketStore((s) => s.setChartMeasureActive);
  const setCurrentPair = useMarketStore((s) => s.setCurrentPair);
  const setCurrentInterval = useMarketStore((s) => s.setCurrentInterval);
  const setChartIndicator = useMarketStore((s) => s.setChartIndicator);
  const lastPrices = useMarketStore((s) => s.lastPrices);
  const [stats24h, setStats24h] = useState<Stats24h | null>(null);

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

  return (
    <>
      <Header />
      <main className="main-grid">
        <WalletSection />
        <section className="crypto-section">
          <h1>Mercado spot</h1>
          <PairSearch />
          <TrackedPairs />
          <div id="pair-details">
            {currentPair && (
              <>
                <div className="chart-topline">
                  <div className="chart-market-summary">
                    <span className="chart-kicker">Spot</span>
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
                        <div><span className="label">24h cambio</span> {parseFloat(stats24h.priceChange) >= 0 ? '+' : ''}{parseFloat(stats24h.priceChange).toFixed(4)} ({parseFloat(stats24h.priceChangePercent) >= 0 ? '+' : ''}{parseFloat(stats24h.priceChangePercent).toFixed(2)}%)</div>
                        <div><span className="label">Max</span> {stats24h.highPrice.toLocaleString()}</div>
                        <div><span className="label">Min</span> {stats24h.lowPrice.toLocaleString()}</div>
                        <div><span className="label">Vol</span> {compactNumber(stats24h.quoteVolume)}</div>
                      </div>
                    )}
                  </div>
                  <button id="close-details" type="button" onClick={() => setCurrentPair(null)} aria-label="Cerrar panel">x</button>
                </div>
                <div className="chart-controls-row">
                  <div className="interval-selector" role="radiogroup" aria-label="Intervalos de velas">
                    {INTERVALS.map((iv) => (
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
                  </div>
                </div>
                <div id="chart-wrapper">
                  <button
                    type="button"
                    className={`chart-tool-button${chartMeasure.active ? ' active' : ''}`}
                    title="Medir rango"
                    aria-label="Medir rango de precio"
                    aria-pressed={chartMeasure.active}
                    onClick={() => setChartMeasureActive(!chartMeasure.active)}
                  >
                    %
                  </button>
                  <CandlestickChart
                    symbol={currentPair}
                    interval={currentInterval}
                    zoom={chartZoom}
                    indicators={chartIndicators}
                    measureActive={chartMeasure.active}
                  />
                </div>
              </>
            )}
          </div>
        </section>
        <TransactionSection />
      </main>
      <Footer />
    </>
  );
}

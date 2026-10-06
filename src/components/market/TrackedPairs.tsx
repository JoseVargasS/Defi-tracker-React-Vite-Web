import { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { useMarketStore, type PairSortMode } from '@/store/useMarketStore';
import { fetchPriceBatch, fetch24hStatsBatch, getSparklineCloses } from '@/api/binance';
import { fetchMexcKlines, fetchMexcTicker } from '@/api/mexc';
import { connectLivePrices, type LiveBatch } from '@/api/live';
import { displayBase, displayPairLabel } from '@/api/market';
import { AlertsWidget } from '@/components/market/AlertsPanel';
import { useInterval } from '@/hooks/useInterval';
import { formatPrice, safeImageUrl } from '@/lib/utils';
import { COIN_ICON_URLS, coinDisplayName } from '@/lib/assets';
import {
  TRACKED_PAIRS_POLL_MS,
  pairKey,
  parseTrackedPair,
  sourceLabel,
  tvIndexHint,
} from '@/lib/config';

const SPARKLINE_POINTS = 24;

const iconUrl = (base: string) => {
  const url = COIN_ICON_URLS[base];
  return url ? safeImageUrl(url) : '';
};

interface RowQuote {
  price: number | null;
  changePercent: number | null;
  quoteVolume: number | null;
}

const SORT_LABEL: Record<PairSortMode, string> = {
  MANUAL: 'Manual',
  VOL_DESC: 'Vol ↓',
  VOL_ASC: 'Vol ↑',
  CHG_DESC: '% ↓',
  CHG_ASC: '% ↑',
};

function sparkPath(closes: number[], w = 40, h = 20): string {
  if (closes.length < 2) return '';
  const min = Math.min(...closes);
  const max = Math.max(...closes);
  const span = max - min || 1;
  return closes
    .map((c, i) => {
      const x = (i / (closes.length - 1)) * w;
      const y = h - ((c - min) / span) * h;
      return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');
}

async function fetchSparkline(entry: string): Promise<number[]> {
  const { symbol, source } = parseTrackedPair(entry);
  try {
    if (source === 'MEXC') {
      const rows = await fetchMexcKlines(symbol, '1h', { singlePage: true });
      return rows
        .map((r) => Number((r as unknown[])[4]))
        .filter((v) => Number.isFinite(v))
        .slice(-SPARKLINE_POINTS);
    }
    if (source === 'TV') return [];
    return (await getSparklineCloses(symbol, SPARKLINE_POINTS + 6)).slice(-SPARKLINE_POINTS);
  } catch {
    return [];
  }
}

export function TrackedPairs() {
  const tracked = useMarketStore((s) => s.tracked);
  const removeTracked = useMarketStore((s) => s.removeTracked);
  const moveTracked = useMarketStore((s) => s.moveTracked);
  const pairSort = useMarketStore((s) => s.pairSort);
  const cyclePairSort = useMarketStore((s) => s.cyclePairSort);
  const liveQuotes = useMarketStore((s) => s.liveQuotes);
  const setLiveQuotes = useMarketStore((s) => s.setLiveQuotes);
  const [rest, setRest] = useState<Record<string, RowQuote>>({});
  const [sparks, setSparks] = useState<Record<string, number[]>>({});
  const dragFrom = useRef<number | null>(null);

  // Sockets en vivo (Binance ~1s, MEXC ~2s); el REST queda de respaldo.
  useEffect(() => {
    if (typeof WebSocket === 'undefined') return;
    return connectLivePrices((batch: LiveBatch) => {
      useMarketStore.getState().setLiveQuotes(batch);
    });
  }, [setLiveQuotes]);

  const poll = useCallback(async () => {
    const entries = useMarketStore.getState().tracked;
    if (!entries.length) return;
    const bySource = new Map<string, string[]>();
    for (const e of entries) {
      const { symbol, source } = parseTrackedPair(e);
      const list = bySource.get(source) ?? [];
      list.push(symbol);
      bySource.set(source, list);
    }
    const next: Record<string, RowQuote> = {};
    const binanceSymbols = bySource.get('Binance') ?? [];
    if (binanceSymbols.length) {
      const [priceRes, statsRes] = await Promise.all([
        fetchPriceBatch(binanceSymbols),
        fetch24hStatsBatch(binanceSymbols),
      ]);
      const prices: Record<string, number> = {};
      for (const p of priceRes) {
        const val = parseFloat(p.price);
        if (Number.isFinite(val)) prices[p.symbol] = val;
      }
      if (Object.keys(prices).length) {
        useMarketStore.setState((state) => ({
          lastPrices: { ...state.lastPrices, ...prices },
        }));
      }
      const statsBy = new Map(statsRes.map((s) => [s.symbol, s]));
      for (const symbol of binanceSymbols) {
        const s = statsBy.get(symbol);
        next[pairKey(symbol, 'Binance')] = {
          price: prices[symbol] ?? null,
          changePercent: s ? parseFloat(s.priceChangePercent || '0') : null,
          quoteVolume: s ? parseFloat(s.quoteVolume || '0') : null,
        };
      }
    }
    const mexcSymbols = bySource.get('MEXC') ?? [];
    for (const symbol of mexcSymbols) {
      const t = await fetchMexcTicker(symbol);
      next[pairKey(symbol, 'MEXC')] = t
        ? { price: t.price, changePercent: t.priceChangePercent, quoteVolume: t.quoteVolume }
        : { price: null, changePercent: null, quoteVolume: null };
    }
    if (Object.keys(next).length) {
      setRest((prev) => ({ ...prev, ...next }));
    }
  }, []);

  useEffect(() => {
    poll();
  }, [poll, tracked]);

  useInterval(poll, TRACKED_PAIRS_POLL_MS);

  // Sparklines: ultimos 24 cierres 1h, refresh al cambiar la lista.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const out: Record<string, number[]> = {};
      for (const entry of tracked) {
        out[entry] = await fetchSparkline(entry);
        if (cancelled) return;
      }
      if (!cancelled) setSparks(out);
    })();
    return () => {
      cancelled = true;
    };
  }, [tracked]);

  const setCurrentPair = useMarketStore((s) => s.setCurrentPair);

  const handleClick = useCallback(
    (entry: string) => () => setCurrentPair(entry),
    [setCurrentPair],
  );

  const handleRemove = useCallback(
    (entry: string) => (e: React.MouseEvent) => {
      e.stopPropagation();
      removeTracked(entry);
    },
    [removeTracked],
  );

  const rows = useMemo(() => {
    const withQuotes = tracked.map((entry, index) => {
      const { symbol, source } = parseTrackedPair(entry);
      const key = pairKey(symbol, source);
      const live = liveQuotes[key];
      const fallback = rest[key];
      return {
        entry,
        index,
        symbol,
        source,
        key,
        price: live?.price ?? fallback?.price ?? null,
        changePercent: live?.changePercent ?? fallback?.changePercent ?? null,
        quoteVolume: live?.quoteVolume ?? fallback?.quoteVolume ?? null,
      };
    });
    const num = (v: number | null) => (v == null || !Number.isFinite(v) ? null : v);
    switch (pairSort) {
      case 'VOL_DESC':
        return [...withQuotes].sort((a, b) => (num(b.quoteVolume) ?? -1) - (num(a.quoteVolume) ?? -1));
      case 'VOL_ASC':
        return [...withQuotes].sort((a, b) => (num(a.quoteVolume) ?? -1) - (num(b.quoteVolume) ?? -1));
      case 'CHG_DESC':
        return [...withQuotes].sort((a, b) => (num(b.changePercent) ?? -Infinity) - (num(a.changePercent) ?? -Infinity));
      case 'CHG_ASC':
        return [...withQuotes].sort((a, b) => (num(a.changePercent) ?? Infinity) - (num(b.changePercent) ?? Infinity));
      default:
        return withQuotes;
    }
  }, [tracked, liveQuotes, rest, pairSort]);

  return (
    <div id="tracked-pairs">
      <div className="pairs-header-row">
        {tracked.length > 0 && (
          <button type="button" id="pair-sort" className="pair-sort-btn" onClick={cyclePairSort} title="Cambiar orden">
            Orden: {SORT_LABEL[pairSort]}
          </button>
        )}
        <AlertsWidget />
      </div>
      {rows.map((row) => {
        const base = displayBase(row.entry);
        const label = displayPairLabel(row.entry);
        const name = coinDisplayName(base);
        const formatted = row.price != null ? formatPrice(row.price) : '-';
        const pct = row.changePercent;
        const change = pct == null || !Number.isFinite(pct) ? '' : `${pct > 0 ? '+' : ''}${pct.toFixed(2)}%`;
        const changeClass = change.startsWith('+') ? 'positive' : change.startsWith('-') ? 'negative' : '';
        const fallback = !COIN_ICON_URLS[base];
        const spark = sparks[row.entry] ?? [];
        const positive = (pct ?? 0) >= 0;

        return (
          <div
            key={row.entry}
            className="tracked-pair"
            role="button"
            tabIndex={0}
            draggable={pairSort === 'MANUAL'}
            onDragStart={() => {
              dragFrom.current = row.index;
            }}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              if (dragFrom.current != null && dragFrom.current !== row.index) {
                moveTracked(dragFrom.current, row.index);
              }
              dragFrom.current = null;
            }}
            onClick={handleClick(row.entry)}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleClick(row.entry)(); } }}
          >
            <div className="coin-icon">
              {fallback ? (
                <span className="coin-icon-text">{base[0]}</span>
              ) : (
                <img src={iconUrl(base)} alt={base} loading="lazy" />
              )}
            </div>
            <div className="coin-info">
              <span className="coin-symbol">
                {label}
              </span>
              <span className="coin-name">{name}</span>
              <span className="coin-source">
                {row.source === 'TV' ? `TV · ${tvIndexHint(row.symbol)}` : sourceLabel(row.source)}
              </span>
            </div>
            {spark.length > 1 && (
              <svg className="pair-spark" width="40" height="20" viewBox="0 0 40 20" aria-hidden="true">
                <path
                  d={sparkPath(spark)}
                  fill="none"
                  stroke={positive ? '#1ecb81' : '#e74c3c'}
                  strokeWidth="1.5"
                />
              </svg>
            )}
            <div className="pair-price-group">
              <span className="pair-price" data-symbol={row.entry}>
                {formatted}
              </span>
              <span className={`pair-change ${changeClass}`} data-symbol={row.entry}>
                {change}
              </span>
            </div>
            <button type="button" className="delete-btn" onClick={handleRemove(row.entry)} title="Eliminar par">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                <polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" />
              </svg>
            </button>
          </div>
        );
      })}
    </div>
  );
}

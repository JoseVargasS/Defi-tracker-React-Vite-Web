import { useState, useCallback, useEffect } from 'react';
import { useMarketStore } from '@/store/useMarketStore';
import { fetchPriceBatch, fetch24hStatsBatch } from '@/api/binance';
import { useInterval } from '@/hooks/useInterval';
import { formatPrice, safeImageUrl } from '@/lib/utils';
import { COIN_ICON_URLS, coinDisplayName } from '@/lib/assets';
import { TRACKED_PAIRS_POLL_MS, splitPairSymbol } from '@/lib/config';

export function TrackedPairs() {
  const tracked = useMarketStore((s) => s.tracked);
  const removeTracked = useMarketStore((s) => s.removeTracked);
  const [marketData, setMarketData] = useState<{ prices: Record<string, number>; changes: Record<string, string> }>({ prices: {}, changes: {} });

  const poll = useCallback(async () => {
    const symbols = useMarketStore.getState().tracked;
    if (!symbols.length) return;
    const [priceRes, statsRes] = await Promise.all([
      fetchPriceBatch(symbols),
      fetch24hStatsBatch(symbols),
    ]);
    const nextPrices: Record<string, number> = {};
    for (const p of priceRes) {
      const val = parseFloat(p.price);
      if (Number.isFinite(val)) {
        nextPrices[p.symbol] = val;
      }
    }
    if (Object.keys(nextPrices).length) {
      useMarketStore.setState((state) => ({
        lastPrices: { ...state.lastPrices, ...nextPrices },
      }));
    }
    const nextChanges: Record<string, string> = {};
    for (const s of statsRes) {
      const pct = parseFloat(s.priceChangePercent || '0');
      nextChanges[s.symbol] = pct > 0 ? `+${pct.toFixed(2)}%` : `${pct.toFixed(2)}%`;
    }
    setMarketData((prev) => ({
      prices: Object.keys(nextPrices).length ? { ...prev.prices, ...nextPrices } : prev.prices,
      changes: nextChanges,
    }));
  }, []);

  useEffect(() => {
    poll();
  }, [poll, tracked]);

  useInterval(poll, TRACKED_PAIRS_POLL_MS);

  const setCurrentPair = useMarketStore((s) => s.setCurrentPair);

  const handleClick = useCallback(
    (symbol: string) => () => setCurrentPair(symbol),
    [setCurrentPair],
  );

  const handleRemove = useCallback(
    (symbol: string) => (e: React.MouseEvent) => {
      e.stopPropagation();
      removeTracked(symbol);
    },
    [removeTracked],
  );

  const iconUrl = (base: string) => {
    const url = COIN_ICON_URLS[base];
    return url ? safeImageUrl(url) : '';
  };

  return (
    <div id="tracked-pairs">
      {tracked.map((symbol) => {
        const { base, quote } = splitPairSymbol(symbol);
        const name = coinDisplayName(base);
        const price = marketData.prices[symbol];
        const formatted = price ? formatPrice(price) : '-';
        const change = marketData.changes[symbol] ?? '';
        const changeClass = change.startsWith('+') ? 'positive' : change.startsWith('-') ? 'negative' : '';
        const fallback = !COIN_ICON_URLS[base];
        const suffix = quote ? '/' + quote : '';

        return (
          <div key={symbol} className="tracked-pair" onClick={handleClick(symbol)}>
            <div className="coin-icon">
              {fallback ? (
                <span className="coin-icon-text">{base[0]}</span>
              ) : (
                <img src={iconUrl(base)} alt={base} loading="lazy" />
              )}
            </div>
            <div className="coin-info">
              <span className="coin-symbol">
                {symbol}
                <span className="coin-symbol-suffix">{suffix}</span>
              </span>
              <span className="coin-name">{name}</span>
            </div>
            <div className="pair-price-group">
              <span className="pair-price" data-symbol={symbol}>
                {formatted}
              </span>
              <span className={`pair-change ${changeClass}`} data-symbol={symbol}>
                {change}
              </span>
            </div>
            <button className="delete-btn" onClick={handleRemove(symbol)} title="Eliminar par">
              ×
            </button>
          </div>
        );
      })}
    </div>
  );
}

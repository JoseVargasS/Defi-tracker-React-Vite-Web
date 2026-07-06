import { useState, useCallback, useEffect } from 'react';
import { useMarketStore } from '@/store/useMarketStore';
import { fetchPriceBatch, fetch24hStatsBatch } from '@/api/binance';
import { useInterval } from '@/hooks/useInterval';
import { formatPrice, safeImageUrl } from '@/lib/utils';

const names: Record<string, string> = {
  BTC: 'BTC', ETH: 'ETH', USDT: 'Tether', BNB: 'BNB', SOL: 'Solana',
  ADA: 'Cardano', XRP: 'XRP', DOGE: 'Dogecoin', MATIC: 'Polygon',
  TRX: 'TRON', LINK: 'Chainlink', LTC: 'Litecoin', DOT: 'Polkadot',
  SHIB: 'Shiba Inu', USDC: 'USD Coin', AVAX: 'Avalanche', OP: 'Optimism',
  ARB: 'Arbitrum', PEPE: 'Pepe',
};

const ICON_MAP: Record<string, string> = {
  BTC: 'https://cryptologos.cc/logos/bitcoin-btc-logo.png',
  ETH: 'https://cryptologos.cc/logos/ethereum-eth-logo.png',
  BNB: 'https://cryptologos.cc/logos/bnb-bnb-logo.png',
  SOL: 'https://cryptologos.cc/logos/solana-sol-logo.png',
  ADA: 'https://cryptologos.cc/logos/cardano-ada-logo.png',
  XRP: 'https://cryptologos.cc/logos/xrp-xrp-logo.png',
  DOGE: 'https://cryptologos.cc/logos/dogecoin-doge-logo.png',
  MATIC: 'https://cryptologos.cc/logos/polygon-matic-logo.png',
  DOT: 'https://cryptologos.cc/logos/polkadot-new-dot-logo.png',
  LINK: 'https://cryptologos.cc/logos/chainlink-link-logo.png',
  LTC: 'https://cryptologos.cc/logos/litecoin-ltc-logo.png',
  TRX: 'https://cryptologos.cc/logos/tron-trx-logo.png',
  SHIB: 'https://cryptologos.cc/logos/shiba-inu-shib-logo.png',
  AVAX: 'https://cryptologos.cc/logos/avalanche-avax-logo.png',
  USDC: 'https://cryptologos.cc/logos/usd-coin-usdc-logo.png',
  USDT: 'https://cryptologos.cc/logos/tether-usdt-logo.png',
  PEPE: 'https://cryptologos.cc/logos/pepe-pepe-logo.png',
  ARB: 'https://cryptologos.cc/logos/arbitrum-arb-logo.png',
  OP: 'https://cryptologos.cc/logos/optimism-op-logo.png',
  BAT: 'https://cryptologos.cc/logos/basic-attention-token-bat-logo.png',
};

const getBase = (symbol: string): string => {
  const knownQuotes = ['USDT', 'USDC', 'FDUSD', 'BTC', 'ETH', 'BNB', 'TRY', 'EUR', 'BRL', 'DAI'];
  const quote = knownQuotes.find((q) => symbol.endsWith(q)) || '';
  return quote ? symbol.slice(0, -quote.length) : symbol;
};

export function TrackedPairs() {
  const tracked = useMarketStore((s) => s.tracked);
  const removeTracked = useMarketStore((s) => s.removeTracked);
  const [prices, setPrices] = useState<Record<string, number>>({});
  const [changes, setChanges] = useState<Record<string, string>>({});

  const poll = useCallback(async () => {
    const symbols = useMarketStore.getState().tracked;
    if (!symbols.length) return;
    const [priceRes, statsRes] = await Promise.all([
      fetchPriceBatch(symbols),
      fetch24hStatsBatch(symbols),
    ]);
    const nextPrices: Record<string, number> = {};
    for (const p of priceRes) {
      const val = parseFloat((p as any).price);
      if (Number.isFinite(val)) {
        nextPrices[p.symbol] = val;
      }
    }
    if (Object.keys(nextPrices).length) {
      useMarketStore.setState((state) => ({
        lastPrices: { ...state.lastPrices, ...nextPrices },
      }));
    }
    setPrices((prev) => ({ ...prev, ...nextPrices }));
    const nextChanges: Record<string, string> = {};
    for (const s of statsRes) {
      const sym = (s as any).symbol as string;
      const pct = parseFloat((s as any).priceChangePercent ?? '0');
      nextChanges[sym] = pct > 0 ? `+${pct.toFixed(2)}%` : `${pct.toFixed(2)}%`;
    }
    setChanges(nextChanges);
  }, []);

  // ponytail: fire once on mount and every time tracked list changes so prices appear instantly
  useEffect(() => {
    poll();
  }, [poll, tracked]);

  useInterval(poll, 5000);

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
    const url = ICON_MAP[base];
    return url ? safeImageUrl(url) : '';
  };

  return (
    <div id="tracked-pairs">
      {tracked.map((symbol) => {
        const base = getBase(symbol);
        const name = names[base] || base;
        const price = prices[symbol];
        const formatted = price ? formatPrice(price) : '-';
        const change = changes[symbol] ?? '';
        const changeClass = change.startsWith('+') ? 'positive' : change.startsWith('-') ? 'negative' : '';
        const fallback = !ICON_MAP[base];

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
                <span className="coin-symbol-suffix">/{getBase(symbol) !== symbol ? 'USD' : ''}</span>
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

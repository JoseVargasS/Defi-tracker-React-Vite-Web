import { useState, useEffect, useCallback, useRef } from 'react';
import { fetchCoinsList, CoinInfo as Coin } from '@/api/binance';
import { useMarketStore } from '@/store/useMarketStore';

const pairLabel = (coin: Coin) => `${coin.base}/${coin.quote}`;
const pairSearchText = (coin: Coin) =>
  `${coin.symbol} ${coin.base} ${coin.quote} ${pairLabel(coin)}`;
const coinMatches = (coin: Coin, upper: string, normalized: string) =>
  pairSearchText(coin).includes(upper) || coin.symbol.includes(normalized);

export function PairSearch() {
  const [query, setQuery] = useState('');
  const [suggestions, setSuggestions] = useState<Coin[]>([]);
  const [show, setShow] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const addTracked = useMarketStore((s) => s.addTracked);
  const setCurrentPair = useMarketStore((s) => s.setCurrentPair);
  const coinsList = useMarketStore((s) => s.coinsList);
  const setCoinsList = useMarketStore((s) => s.setCoinsList);

  useEffect(() => {
    if (coinsList.length) return;
    fetchCoinsList().then((data) => {
      if (data && data.length) {
        setCoinsList(data);
      }
    });
  }, [coinsList.length, setCoinsList]);

  const handleInput = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const q = e.target.value;
      setQuery(q);
      if (!q.trim()) {
        setSuggestions([]);
        setShow(false);
        return;
      }
      const upper = q.trim().toUpperCase();
      const normalized = upper.replace(/[^A-Z0-9]/g, '');
      const coins = coinsList as Coin[];
      const matches: Coin[] = [];
      for (let i = 0; i < coins.length && matches.length < 10; i++) {
        const c = coins[i];
        if (coinMatches(c, upper, normalized)) {
          matches.push(c);
        }
      }
      setSuggestions(matches);
      setShow(true);
    },
    [coinsList],
  );

  const handleSelect = useCallback(
    (coin: Coin) => {
      addTracked(coin.symbol);
      setCurrentPair(coin.symbol);
      setQuery('');
      setSuggestions([]);
      setShow(false);
    },
    [addTracked, setCurrentPair],
  );

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setShow(false);
      }
    };
    document.addEventListener('click', handler);
    return () => document.removeEventListener('click', handler);
  }, []);

  return (
    <div id="pair-form" ref={containerRef}>
      <input
        id="pair-search"
        type="text"
        placeholder="Buscar par..."
        value={query}
        onChange={handleInput}
        autoComplete="off"
      />
      <div id="pair-suggestions" className={show && suggestions.length ? 'active' : ''}>
        {suggestions.length === 0 && query.trim() ? (
          <div>No se encontraron pares.</div>
        ) : (
          suggestions.map((coin) => (
            <button
              type="button"
              key={coin.symbol}
              onClick={() => handleSelect(coin)}
            >
              {pairLabel(coin)}
            </button>
          ))
        )}
      </div>
    </div>
  );
}

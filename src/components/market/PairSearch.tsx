import { useState, useEffect, useCallback, useRef } from 'react';
import { fetchAvailableSymbols, filterAvailableSymbolsGrouped, trackedEntryFor, type AvailableSymbol, type SymbolGroup } from '@/api/market';
import { sourceLabel } from '@/lib/config';
import { useMarketStore } from '@/store/useMarketStore';

export function PairSearch() {
  const [query, setQuery] = useState('');
  const [groups, setGroups] = useState<SymbolGroup[]>([]);
  const [show, setShow] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const addTracked = useMarketStore((s) => s.addTracked);
  const setCurrentPair = useMarketStore((s) => s.setCurrentPair);
  const coinsList = useMarketStore((s) => s.coinsList);
  const setCoinsList = useMarketStore((s) => s.setCoinsList);

  useEffect(() => {
    if (coinsList.length) return;
    fetchAvailableSymbols().then((data) => {
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
        setGroups([]);
        setShow(false);
        return;
      }
      setGroups(filterAvailableSymbolsGrouped(coinsList as AvailableSymbol[], q, 7));
      setShow(true);
    },
    [coinsList],
  );

  const handleSelect = useCallback(
    (coin: AvailableSymbol) => {
      const entry = trackedEntryFor(coin.symbol, coin.source);
      addTracked(entry);
      setCurrentPair(entry);
      setQuery('');
      setGroups([]);
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

  const total = groups.reduce((acc, g) => acc + g.items.length, 0);

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
      <div id="pair-suggestions" className={show && total ? 'active' : ''}>
        {total === 0 && query.trim() ? (
          <div>No se encontraron pares.</div>
        ) : (
          groups.map((group) => (
            <div key={group.source} className="pair-suggest-group">
              <div className="pair-suggest-title">{group.title}</div>
              {group.items.map((coin) => (
                <button
                  type="button"
                  key={`${coin.symbol}-${coin.source}`}
                  onClick={() => handleSelect(coin)}
                >
                  {coin.displayName}
                  <span className="coin-symbol-suffix"> · {sourceLabel(coin.source)}</span>
                </button>
              ))}
            </div>
          ))
        )}
      </div>
    </div>
  );
}

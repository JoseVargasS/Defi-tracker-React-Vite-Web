import { useCallback, useEffect } from 'react';
import { useWalletStore } from '@/store/useWalletStore';
import { readSavedWallets, writeSavedWallets, clearAppStorage } from '@/lib/storage';
import { ETH_API, ETH_KEY, HAS_COINSTATS_CONFIG, HAS_ETHERSCAN_CONFIG, SUPPORTED_CHAINS } from '@/lib/config';
import { makeRequest } from '@/api/client';
import { safeErrorMessage, mapWithConcurrency, integerAmountToNumber, TOKEN_ICON_FALLBACKS } from '@/lib/utils';
import { getTokenAssetsByAddress } from '@/api/coinstats';
import { WalletDashboard } from './WalletDashboard';

const BALANCE_CONCURRENCY = 1;

const CHAIN_FALLBACKS: Record<string, { chainId: number; nativeSymbol: string; nativeName: string }> = {
  ethereum: { chainId: 1, nativeSymbol: 'ETH', nativeName: 'Ethereum' },
  'base-wallet': { chainId: 8453, nativeSymbol: 'ETH', nativeName: 'Ethereum' },
  binancesmartchain: { chainId: 56, nativeSymbol: 'BNB', nativeName: 'BNB' },
};

const STABLE_PRICES: Record<string, number> = {
  USDT: 1, USDC: 1, USD0: 1, DAI: 1,
};

const WALLET_RE = /^0x[a-fA-F0-9]{40}$/;

async function getFallbackTokenPrice(symbol: string): Promise<number | null> {
  const normalized = symbol.toUpperCase();
  if (STABLE_PRICES[normalized] !== undefined) return STABLE_PRICES[normalized];
  if (normalized === 'ETH' || normalized === 'BNB') {
    try {
      const res = await makeRequest(
        `${import.meta.env.VITE_BINANCE_API || 'https://api.binance.com/api/v3'}/ticker/price?symbol=${normalized}USDT`
      ) as { price: string };
      const price = Number.parseFloat(res.price);
      return Number.isFinite(price) && price > 0 ? price : null;
    } catch {
      return null;
    }
  }
  return null;
}

async function fetchExplorerBalances(address: string, chain: { id: string; name: string; icon: string }) {
  if (!HAS_ETHERSCAN_CONFIG) return null;

  const fallback = CHAIN_FALLBACKS[chain.id];
  if (!fallback) return null;

  const safeAddress = encodeURIComponent(address);
  const balanceUrl = `${ETH_API}?chainid=${fallback.chainId}&module=account&action=balance&address=${safeAddress}&tag=latest&apikey=${ETH_KEY}`;
  const tokenUrl = `${ETH_API}?chainid=${fallback.chainId}&module=account&action=tokentx&address=${safeAddress}&page=1&offset=1000&sort=asc&apikey=${ETH_KEY}`;

  const [nativeResponse, tokenResponse] = await Promise.allSettled([
    makeRequest(balanceUrl),
    makeRequest(tokenUrl),
  ]);

  const balances: { name: string; symbol: string; amount: number; price: number | null; imgUrl: string | null }[] = [];

  const nativeWei: string = nativeResponse.status === 'fulfilled' ? (nativeResponse.value as any)?.result ?? '0' : '0';
  const nativeAmount = integerAmountToNumber(nativeWei, 18);
  const nativePrice = await getFallbackTokenPrice(fallback.nativeSymbol);
  if (nativeAmount > 0) {
    balances.push({
      name: fallback.nativeName,
      symbol: fallback.nativeSymbol,
      amount: nativeAmount,
      price: nativePrice,
      imgUrl: TOKEN_ICON_FALLBACKS[fallback.nativeSymbol] || null,
    });
  }

  const tokenTxs: any[] = tokenResponse.status === 'fulfilled' && Array.isArray((tokenResponse.value as any)?.result)
    ? (tokenResponse.value as any).result
    : [];

  const addressLower = address.toLowerCase();
  const tokenBalances = new Map<string, { raw: bigint; decimals: number; name: string; symbol: string; imgUrl: string | null }>();

  for (const tx of tokenTxs) {
    const contract = String(tx.contractAddress || tx.tokenSymbol || '').toLowerCase();
    const symbol = String(tx.tokenSymbol || 'TOKEN').toUpperCase();
    const decimals = Number(tx.tokenDecimal ?? 18);
    const key = `${contract}-${symbol}`;
    const current = tokenBalances.get(key) || {
      raw: BigInt(0),
      decimals,
      name: tx.tokenName || symbol,
      symbol,
      imgUrl: TOKEN_ICON_FALLBACKS[symbol] || null,
    };

    let value: bigint;
    try { value = BigInt(String(tx.value || '0')); } catch { value = BigInt(0); }

    if (String(tx.to || '').toLowerCase() === addressLower) current.raw += value;
    if (String(tx.from || '').toLowerCase() === addressLower) current.raw -= value;
    tokenBalances.set(key, current);
  }

  for (const token of tokenBalances.values()) {
    if (token.raw <= BigInt(0)) continue;
    const amount = integerAmountToNumber(token.raw.toString(), token.decimals);
    if (amount <= 0) continue;
    const price = await getFallbackTokenPrice(token.symbol);
    balances.push({ name: token.name, symbol: token.symbol, amount, price, imgUrl: token.imgUrl });
  }

  return { chain, balances, source: 'etherscan' as const };
}

async function fetchChainBalances(address: string, chain: { id: string; name: string; icon: string }) {
  if (HAS_COINSTATS_CONFIG) {
    try {
      const data = await getTokenAssetsByAddress(address, chain.id);
      const normalizedBalances = data?.result ?? [];
      if (normalizedBalances.length > 0 || !CHAIN_FALLBACKS[chain.id]) {
        return {
          chain,
          balances: normalizedBalances.map(b => ({
            name: b.name || b.symbol,
            symbol: b.symbol,
            amount: b.amount || 0,
            price: Number.isFinite(Number(b.price)) ? Number(b.price) : null,
            imgUrl: b.icon || null,
          })),
          source: 'coinstats' as const,
        };
      }
    } catch (error) {
      console.warn(`Error fetching ${chain.name} from CoinStats:`, safeErrorMessage(error));
    }
  }

  return fetchExplorerBalances(address, chain);
}

async function fetchWalletAssets(address: string): Promise<{ assets: import('@/store/useWalletStore').WalletAsset[]; totalWorth: number }> {
  const chainResults = await mapWithConcurrency(
    [...SUPPORTED_CHAINS],
    BALANCE_CONCURRENCY,
    chain => fetchChainBalances(address, chain)
  );

  let allAssets: import('@/store/useWalletStore').WalletAsset[] = [];
  const byChain: Record<string, import('@/store/useWalletStore').WalletAsset[]> = {};

  for (const result of chainResults) {
    if (!result || !result.balances || result.balances.length === 0) continue;

    const chainAssets = result.balances
      .map(token => ({
        symbol: token.symbol,
        amount: token.amount || 0,
        price: Number.isFinite(Number(token.price)) ? Number(token.price) : null,
        total: Number.isFinite(Number(token.price)) ? (token.amount || 0) * Number(token.price) : 0,
        chain: result.chain.name,
        chainId: result.chain.id,
        chainIcon: result.chain.icon,
        imgUrl: token.imgUrl || '',
      }))
      .filter(asset => asset.amount > 0);

    if (chainAssets.length > 0) {
      byChain[result.chain.name] = chainAssets;
      allAssets = allAssets.concat(chainAssets);
    }
  }

  const totalWorth = allAssets.reduce((acc, a) => acc + (a.total || 0), 0);
  return { assets: allAssets, totalWorth };
}

export function WalletSection() {
  const {
    address, savedWallets, loading, error, assets, totalWorth,
    setAddress, setSavedWallets, addSavedWallet, removeSavedWallet,
    setLoading, setError, setAssets,
  } = useWalletStore();

  useEffect(() => {
    setSavedWallets(readSavedWallets());
  }, [setSavedWallets]);

  const handleSave = useCallback(() => {
    if (!WALLET_RE.test(address)) {
      setError('Direccion invalida. Debe ser 0x seguido de 40 caracteres hex.');
      return;
    }
    addSavedWallet(address);
    const updated = writeSavedWallets([...savedWallets, address]);
    setSavedWallets(updated);
    setError(null);
  }, [address, addSavedWallet, savedWallets, setSavedWallets, setError]);

  const handleDelete = useCallback((wallet: string) => {
    removeSavedWallet(wallet);
    const updated = writeSavedWallets(savedWallets.filter(w => w !== wallet));
    setSavedWallets(updated);
    if (wallet === useWalletStore.getState().address) {
      setAddress('');
    }
    setError(null);
  }, [removeSavedWallet, savedWallets, setSavedWallets, setAddress, setError]);

  const handleCopy = useCallback((wallet: string) => {
    navigator.clipboard.writeText(wallet).catch(() => {});
  }, []);

  const handleClearAll = useCallback(() => {
    clearAppStorage();
    setSavedWallets([]);
    setAddress('');
    setAssets([], 0);
    setError(null);
  }, [setSavedWallets, setAddress, setAssets, setError]);

  const doSearch = useCallback(async (wallet: string) => {
    if (!WALLET_RE.test(wallet)) {
      setError('Direccion invalida. Debe ser 0x seguido de 40 caracteres hex.');
      return;
    }

    if (!HAS_COINSTATS_CONFIG && !HAS_ETHERSCAN_CONFIG) {
      setError('Falta cargar config con COINSTATS_API_KEY o ETH_KEY. Ejecuta node scripts/generate-config.mjs.');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const result = await fetchWalletAssets(wallet);
      setAssets(result.assets, result.totalWorth);
    } catch (err) {
      setError(safeErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [setLoading, setError, setAssets]);

  const handleSearch = useCallback(async () => {
    if (!WALLET_RE.test(address)) {
      setError('Direccion invalida. Debe ser 0x seguido de 40 caracteres hex.');
      return;
    }
    await doSearch(address);
  }, [address, doSearch, setError]);

  const handleSavedClick = useCallback((wallet: string) => {
    setAddress(wallet);
    doSearch(wallet);
  }, [setAddress, doSearch]);

  const handleInput = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setAddress(e.target.value);
  }, [setAddress]);

  const isSaved = savedWallets.includes(address);
  const truncated = (w: string) => w.length > 14 ? `${w.slice(0, 6)}...${w.slice(-4)}` : w;

  return (
    <section className="wallet-section">
      <header>
        <h1>Wallet</h1>
      </header>

      <div className="card">
        <div className="input-group">
          <input
            type="text"
            value={address}
            onChange={handleInput}
            placeholder="0x..."
            className="wallet-input"
          />
          <button
            className="btn-search"
            onClick={handleSearch}
            disabled={loading}
          >
            {loading ? (
              <span className="btn-loading-spinner" />
            ) : (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
              </svg>
            )}
            {loading ? 'Buscando...' : 'Buscar'}
          </button>
          {address && !isSaved && (
            <button className="btn-save" onClick={handleSave} disabled={loading} title="Guardar billetera">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/>
              </svg>
            </button>
          )}
        </div>

        {error && (
          <div className="wallet-error">{error}</div>
        )}

        {loading && (
          <div className="wallet-loading">Cargando balances de multiples redes...</div>
        )}

        {savedWallets.length > 0 && (
          <div className="wallet-saved-section">
            <div className="wallet-saved-header">
              <span className="wallet-saved-title">Billeteras guardadas</span>
              <button className="btn-clear-all" onClick={handleClearAll} title="Eliminar todas">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/>
                </svg>
                Limpiar
              </button>
            </div>
            <div className="wallet-saved-list">
              {savedWallets.map(w => (
                <div
                  key={w}
                  className={`wallet-chip${w === address ? ' active' : ''}`}
                  onClick={() => { if (!loading) handleSavedClick(w); }}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => { if (e.key === 'Enter' && !loading) handleSavedClick(w); }}
                >
                  <span className="wallet-chip-address">{truncated(w)}</span>
                  <div className="wallet-chip-actions">
                    <button
                      className="wallet-chip-btn"
                      onClick={(e) => { e.stopPropagation(); handleCopy(w); }}
                      title="Copiar direccion"
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/>
                      </svg>
                    </button>
                    <button
                      className="wallet-chip-btn wallet-chip-btn-danger"
                      onClick={(e) => { e.stopPropagation(); handleDelete(w); }}
                      title="Eliminar billetera"
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/>
                      </svg>
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        <div id="walletData">
          {!loading && assets.length > 0 && (
            <WalletDashboard assets={assets} totalWorth={totalWorth} />
          )}
          {!loading && !error && assets.length === 0 && address && (
            <div className="wallet-empty">
              No se encontraron balances con valor en ninguna red
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
